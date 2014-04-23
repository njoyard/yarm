---
layout: default
title: yarm - Using multiple instances
id: doc-using-multiple-instances
---
# Using multiple instances

If you use the yarm middleware on multiple routes (or multiple servers), by default all resources will be shared.

```js
app.use("/rest1", yarm());
app.use("/rest2", yarm());

yarm.resource("hello")
  .get(function(req, cb) {
    cb(null, "Hello, world");
  });
<div class="highlight"><pre><code>
</code></pre></div>
$ curl http://localhost/rest1/hello
Hello, world

$ curl http://localhost/rest2/hello
Hello, world
```

If you want separate resources, you can create a separate yarm instance with `yarm.newInstance()`.

```js
var yarm = require("yarm");
var yarmFR = yarm.newInstance();

app.use("/rest", yarm);
app.use("/rest-fr", yarmFR);

yarm.resource("hello")
  .get(function(req, cb) {
    cb(null, "Hello, world");
  });

yarmFR.resource("bonjour")
  .get(function(req, cb) {
    cb(null, "Bonjour, tout le monde");
  });
<div class="highlight"><pre><code>
</code></pre></div>
$ curl http://localhost/rest/hello
Hello, world

$ curl -i http://localhost/rest/bonjour
HTTP/1.1 404 Not found

$ curl -i http://localhost/rest-fr/hello
HTTP/1.1 404 Not found

$ curl http://localhost/rest-fr/bonjour
Bonjour, tout le monde
```

<div class="footer">documentation last generated for yarm version {% include version %} on {% include gendate %}</div>

[mongoose-toobject]: http://mongoosejs.com/docs/api.html#document_Document-toObject