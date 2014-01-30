---
layout: default
title: yarm - Usage
id: doc-usage
---
# Usage

<a name="basics"></a>
## Basics

Use yarm as any other Express middleware.

{% highlight javascript %}
var app = require("express")();
var yarm = require("yarm");

app.use("/rest", yarm());
app.listen(80);
{% endhighlight %}


<a name="serving-native-javascript-resources"></a>
## Serving native javascript resources

Use `yarm.native()` to serve native Javascript objects or arrays.

{% highlight javascript %}
var app = require("express")();
var yarm = require("yarm");

app.use("/rest", yarm());

yarm.native("me", {
  name: "Alice",
  age: 30
});

yarm.native("friends", [
  "Bob",
  "Charlie"
]);

app.listen(80);
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/me</span>
{
  "name": "Alice",
  "age": 30
}

<span class="p">$ curl http://localhost/rest/me/name</span>
Alice

<span class="p">$ curl http://localhost/rest/friends</span>
{
  "_count": 2,
  "_items": [ "Bob", "Charlie" ]
}

<span class="p">$ curl http://localhost/rest/friends/1</span>
Charlie
</code></pre></div>

Head on to the [Native resources](doc-native-resources.html) chapter for more details.


<a name="serving-mongoose-models-and-aggregates"></a>
## Serving mongoose models and aggregates

When mongoose is available, you can use `yarm.mongoose()` to serve models.

{% highlight javascript %}
var app = require("express")();
var yarm = require("yarm");
var mongoose = require("mongoose");

app.use("/rest", yarm());

var postSchema = new mongoose.Schema({
  title: String,
  text: String,
  comments: [{
    author: String,
    text: String
  }]
});

var Post = mongoose.model("post", postSchema);

yarm.mongoose("posts", Post);

app.listen(80);
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/posts?skip=10&limit=1</span>
{
  "_count": 42,
  "_items": [
    {
      "_id": "507f191e810c19729de860ea",
      "title": "My 11th post",
      "text": "Hello, World",
      "comments": [
        {
          "author": "Bob",
          "text": "First !"
        }
      ]
    }
  ]
}

<span class="p">$ curl http://localhost/rest/posts/507f191e810c19729de860ea</span>
{
  "_id": "507f191e810c19729de860ea",
  "title": "My 11th post",
  "text": "Hello, World",
  "comments": [
    {
      "author": "Bob",
      "text": "First !"
    }
  ]
}

<span class="p">$ curl http://localhost/rest/posts/507f191e810c19729de860ea/comments/0/text</span>
First !
</code></pre></div>

Head on to the [Mongoose resources](doc-mongoose-resources.html) chapter for more details.


<a name="serving-custom-resources"></a>
## Serving custom resources

Use `yarm.resource` to define resources with custom handlers.

{% highlight javascript %}
var app = require("express")(),
var yarm = require("yarm");

yarm.resource("greeting")
  .get(function(req, cb) {
    cb(null, { hello: "world" });
  })
  .sub("french")
    .get(function(req, cb) {
      cb(null, { bonjour: "tout le monde" });
    });

yarm.resource("greeting/pirate")
  .get(function(req, cb) {
    cb(null, { arrrrr: "arrrrrr" });
  });

app.use("/rest", yarm());
app.listen(80);
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/greeting</span>
{
  "hello": "world"
}

<span class="p">$ curl http://localhost/rest/greeting/french</span>
{
  "bonjour": "tout le monde"
}

<span class="p">$ curl http://localhost/rest/greeting/pirate</span>
{
  "arrrrr": "arrrrrr"
}
</code></pre></div>

Head on to the [Custom resources](doc-custom-resources.html) chapter for more details.


<a name="extending-served-resources"></a>
## Extending served resources

yarm allows adding and replacing handlers for any resource or sub-resource. This enables restricting or extending the behaviour of the default native and mongoose resource handlers, as well as defining very complex custom resource hierarchies.

{% highlight javascript %}

yarm.<whatever>()
  .get(function(req, cb) {
    // Override GET handler here
  });

function notAllowed(req, cb) {
  cb(null, "Nope, sorry :(");
}

yarm.native("readonly", myObject)
  .put(notAllowed)
  .post(notAllowed)
  .del(notAllowed)
    .sub("*")
    .put(notAllowed)
    .post(notAllowed)
    .del(notAllowed);

yarm.resource("already/defined/path")
  .get(function(req, cb) {
    // Will not alter 'already' nor 'already/defined' handlers,
    // nor those for 'already/defined/other' if they are defined
  });
{% endhighlight %}

Head on to the [Extending resources](doc-extending-resources.html) chapter for more details.



<div class="footer">documentation last generated for yarm version {% include version %} on {% include gendate %}</div>

[mongoose-toobject]: http://mongoosejs.com/docs/api.html#document_Document-toObject