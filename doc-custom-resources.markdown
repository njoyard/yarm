---
layout: default
title: yarm - Custom resources
id: doc-custom-resources
---
# Custom resources

You can define bare resources (that is, resources without any default method handlers) using `yarm.resource()`.

{% highlight javascript %}
var resource = yarm.resource("myResource");
var deepResource = yarm.resource("path/to/deep/resource");
{% endhighlight %}

The whole point of defining bare resource is to define custom handlers, which is described in the next chapter.

[mongoose-toobject]: http://mongoosejs.com/docs/api.html#document_Document-toObject