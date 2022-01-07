const express = require("express");
const app = express();
const md = require("jstransformer")(require("jstransformer-markdown-it"));
const multer = require("multer");
const upload = multer().single("image");

const {Storage} = require("@google-cloud/storage");
// TODO project name goes here
const bucket = new Storage().bucket("myproject.appspot.com");
const {Datastore} = require("@google-cloud/datastore");
const datastore = new Datastore();
const {SecretManagerServiceClient} = require("@google-cloud/secret-manager");
const secret = new SecretManagerServiceClient();

app.set("view engine", "pug");
app.use(express.urlencoded({extended:true}));

app.get("/", (req, res) => {
	res.redirect("/Main_Page");
});

app.use("/edit", (req, res, next) => {
	// TODO authentication middleware goes here
	next();
});

app.post("/edit", upload, (req, res, next) => {
	bucket.file(`pages/${req.body.title}.md`).save(req.body.content)
	.then(() => res.send("Page edited!"));
});

app.get("/edit/:page(\\w+)", (req, res) => {
	bucket.file(`pages/${req.page}.md`).download()
	.then(data => res.locals.content = data[0].toString())
	.catch(_ => res.locals.content = "Write page content here...")
	.finally(() => res.render("editpage"));
});

app.get("/edit/:page(\\w+)/delete", (req, res) => {
	bucket.file(`pages/${req.page}.md`).delete({ignoreNotFound:true})
	.then(_ => res.send("Page deleted!"));
});

app.post("/edit/upload", (req, res, next) => upload(req, res, err => {
	if (err instanceof multer.MulterError) {
		res.json({error:"importError"});
	} else if (err) {
		next(err);
	} else {
		// TODO use file hash for filename
		// TODO check file before saving
		bucket.file(req.file.originalname).save(req.file.buffer);
		res.json({data:{filePath:`image/${req.file.originalname}`}});
	}
}));

app.get("/image/:file", (req, res) => {
	const img = req.params.file;
	bucket.file(img).download().then(data => {
		res.type(img.substring(img.lastIndexOf(".")));
		res.send(data[0]);
	}).catch(_ => res.sendStatus(404));
});

app.get("/search", (req, res) => {
	if (req.xhr) {
		getPages(req.query.page).then(pages => res.json(pages));
	} else {
		bucket.file(`pages/${req.query.page}.md`).exists()
		.then(data => {
			if (data[0]) { // file exists
				res.redirect("/" + req.query.page.replaceAll(" ", "_"));
			} else {
				// TODO show search results
				res.sendStatus(404);
			}
		});
	}
});

app.get("/:page(\\w+)", (req, res) => {
	bucket.file(`pages/${req.page}.md`).download()
	.then(data => {
		res.locals.content = md.render(data[0].toString(), {
			plugins: [require("./markdown-it-footnote")]
		}).body;
	}).catch(_ => res.status(404))
	.finally(() => res.render("base"));
});

app.param("page", (req, res, next, page) => {
	req.page = page.replaceAll("_", " ");
	res.locals.title = req.page;
	next();
});

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}...`);
});

async function getPages(name = "") {
	try {
		const [files] = await bucket.getFiles({
			prefix: "pages/" + name.charAt(0).toUpperCase() + name.substring(1)
		});
		return files.slice(1).map(file => file.name.slice(6, -3));
	} catch {
		return [];
	}
}

