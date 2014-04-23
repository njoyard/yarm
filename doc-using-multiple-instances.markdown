---
layout: default
title: yarm - Using multiple instances
id: doc-using-multiple-instances
---
# Using multiple instances

If you use the yarm middleware on multiple routes (or multiple servers), by default all resources will be shared.

{% highlight javascript %}
app.use("/rest1", yarm());
app.use("/rest2", yarm());

yarm.resource("hello")
  .get(function(req, cb) {
    cb(null, "Hello, world");
  });
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest1/hello</span>
Hello, world

<span class="p">$ curl http://localhost/rest2/hello</span>
Hello, world
</code></pre></div>

If you want separate resources, you can create a separate yarm instance with `yarm.newInstance()`.

{% highlight javascript %}
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
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/hello</span>
Hello, world

<span class="p">$ curl -i http://localhost/rest/bonjour</span>
HTTP/1.1 404 Not found

<span class="p">$ curl -i http://localhost/rest-fr/hello</span>
HTTP/1.1 404 Not found

<span class="p">$ curl http://localhost/rest-fr/bonjour</span>
Bonjour, tout le monde
</code></pre></div>

<div class="footer">documentation last generated for yarm version {% include version %} on {% include gendate %}</div>

[mongoose-toobject]: http://mongoosejs.com/docs/api.html#document_Document-toObject