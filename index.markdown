---
layout: default
title: yarm
id: about
---
# About

yarm is a REST middleware for [Express][express].  It enables easy definition of custom resources and can serve [Mongoose][mongoose] models easily.  It is fairly minimal and designed to be customizable and extensible.

{% highlight javascript %}
var app = require("express")();
var yarm = require("yarm");
var Post = require("models/post");

app.use("/rest", yarm());
yarm.mongoose("posts", Post)

app.listen(80);
{% endhighlight %}

yarm is open source and published under the terms of the [MIT license][license].

[express]: http://expressjs.com/
[mongoose]: http://mongoosejs.com/
[license]: https://raw2.github.com/njoyard/yarm/master/LICENSE