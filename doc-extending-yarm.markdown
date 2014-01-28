---
layout: default
title: yarm - Extending yarm
id: doc-extending-yarm
---
# Extending yarm

You can add new resource definition helpers to yarm with `yarm.extend()`, and the built-in native and mongoose helpers are actually defined this way.  This is very useful when you use the same kind of resource customization on several resources.

{% highlight javascript %}
yarm.extend("onlyOneProperty", function(path, object, property) {
  // Use this.sub(...) to define "root" resources
  var resource = this.sub(path)
    .get(function(req, cb) {
      cb(null, object[property]);
    });

  // Remember to return the resource to enable method chaining
  return resource;
});

yarm.onlyOneProperty("path/to/object", { "rest": "Hey !" }, "rest");

app.use("/rest", yarm());
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/path/to/object</span>
Hey !
</code></pre></div>

[mongoose-toobject]: http://mongoosejs.com/docs/api.html#document_Document-toObject