yarm
====

Yet Another REST Module for node.js and Express.

Usage
-----

```javascript
var app = require("express")(),
	yarm = require("yarm");

yarm.resource("myResource", {
	get: function(req, cb) {
		cb(null, { hello: "world" });
	}
});

app.use("/rest", yarm());
app.listen(80);
```

```
$ curl http://localhost:80/rest/myResource
{ "hello": "world" }
```

More documentation to come ! In the meantime check out lib/index.js for
a comprehensive resource definition documentation, and check lib/{array,
object,mongoose}.js for resource definition helpers.
