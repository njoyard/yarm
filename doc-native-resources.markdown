---
layout: default
title: yarm - Native resources
id: doc-native-resources
---
# Native resources

<a name="definition"></a>
## Definition

The `yarm.native()` helper allows serving plain Javascript objects and arrays. Served object and arrays will allow access to any property path, including array indices).

{% highlight javascript %}
yarm.native("object", {
  foo: "bar",
  sub: {
    array: [1, 2, 3, 4, 5],
    property: "baz"
  }
});
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/object</span>
{
  "foo": "bar",
  "sub": {
    "array": [1, 2, 3, 4, 5],
    "property": "baz"
  }
}

<span class="p">$ curl http://localhost/rest/object/sub/property</span>
baz

<span class="p">$ curl http://localhost/rest/object/sub/array/2</span>
3
</code></pre></div>

Arrays are served as collections, i.e. yarm will respond with a JSON object containing the total item count and a subset of the array items.

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/object/sub/array</span>
{
  "_count": 5,
  "_items": [1, 2, 3, 4, 5]
}
</code></pre></div>

By default, yarm returns at most 10 items in collection responses.  You can change this default by passing a `defaultLimit` option to the middleware.

{% highlight javascript %}
app.use(yarm({ defaultLimit: 100 }));
{% endhighlight %}

Clients can also specify an offset and limit when requesting collections.  The requested limit will override the default value, and requesting a limit of 0 will make yarm return all items from the collection, starting at the specified offset.  In any case, the "_count" property will always return the total item count in the collection.

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/object/sub/array?limit=1</span>
{
  "_count": 5,
  "_items": [1]
}

<span class="p">$ curl http://localhost/rest/object/sub/array?skip=2&limit=0</span>
{
  "_count": 5,
  "_items": [3, 4, 5]
}
</code></pre></div>


<a name="modification"></a>
## Modification

Native yarm resources can be modified using PUT, PATCH, POST and DELETE HTTP methods.

Note that the examples below assume you have set up middleware to parse JSON request bodies (such as `express.json()` or `express.bodyParser()`).


<a name="delete"></a>
### DELETE

The DELETE method allows removing object properties or array items.

<div class="highlight"><pre><code><span class="p">$ curl -X DELETE http://localhost/rest/object/sub/array/2</span>
<span class="p">$ curl http://localhost/rest/object/sub</span>
{
  "array": [1, 2, 4, 5],
  "property": "baz"
}

<span class="p">$ curl -X DELETE http://localhost/rest/object/sub/property</span>
<span class="p">$ curl http://localhost/rest/object/sub</span>
{
  "array": [1, 2, 3, 4, 5]
}
</code></pre></div>

Note that clients cannot DELETE the root resource itself.

<div class="highlight"><pre><code><span class="p">$ curl -i -X DELETE http://localhost/rest/object</span>
HTTP/1.1 405 Method not allowed
</code></pre></div>


<a name="put"></a>
### PUT

The PUT method allows replacing object properties or array items.

<div class="highlight"><pre><code><span class="p">$ curl -X PUT -d '{ "newArray": [1, 2, 3] }' http://localhost/rest/object/sub</span>
<span class="p">$ curl http://localhost/rest/object/sub</span>
{
  "newArray": [1, 2, 3]
}
</code></pre></div>

If a `_value` key is present in the request body, its value will be used instead.  This allows passing values that are not valid JSON (eg. strings, numbers or booleans).

<div class="highlight"><pre><code><span class="p">$ curl -X PUT -d '{ "_value": "foo" }' \</span>
  http://localhost/rest/object/sub/newArray/0

<span class="p">$ curl http://localhost/rest/object/sub</span>
{
  "newArray": ["foo", 2, 3]
}
</code></pre></div>

As with the DELETE method, clients cannot PUT the root resource itself.

<div class="highlight"><pre><code><span class="p">$ curl -i -X PUT -d '{}' http://localhost/rest/object</span>
HTTP/1.1 405 Method not allowed
</code></pre></div>


<a name="patch"></a>
### PATCH

The PATCH method allows adding and changing properties in an object.

<div class="highlight"><pre><code><span class="p">$ curl -X PATCH -d '{"foo":"bar"}' http://localhost/rest/object/sub</span>
<span class="p">$ curl http://localhost/rest/object/sub</span>
{
  "newArray": ["foo", 2, 3],
  "foo": "bar"
}

<span class="p">$ curl -X PATCH -d '{"newArray":[],"num":42}' http://localhost/rest/object/sub</span>
<span class="p">$ curl http://localhost/rest/object/sub</span>
{
  "newArray": [],
  "foo": "bar",
  "num": 42
}
</code></pre></div>

The PATCH method is only available on object sub-resources.  Attempting to PATCH the root resource or a non-object sub-resource will result in a "405 Method not allowed" response.


<a name="post"></a>
### POST

The POST method allows adding items to arrays or properties to objects.

When adding items to arrays, as with the PUT method, the `_value` key in the request body will be used when it is present.

<div class="highlight"><pre><code><span class="p">$ curl -X POST -d '{"name":"Alice"}' http://localhost/rest/object/sub/newArray</span>
<span class="p">$ curl http://localhost/rest/object/sub/newArray</span>
{
   "_count": 1,
   "_items": [
     { "name": "Alice"}
   ]
}

<span class="p">$ curl -X POST -d '{"_value":"Bob"}' http://localhost/rest/object/sub/newArray</span>
<span class="p">$ curl http://localhost/rest/object/sub/newArray</span>
{
   "_count": 2,
   "_items": [
     { "name": "Alice" },
     "Bob"
   ]
}
</code></pre></div>

When adding properties to objects, both a `_key` and a `_value` keys must be present in the request body or yarm will respond with "400 Bad request".

<div class="highlight"><pre><code><span class="p">$ curl -X POST -d '{"_key":"age","_value":30}' \</span>
  http://localhost/rest/object/sub/newArray/0

<span class="p">$ curl http://localhost/rest/object/sub/newArray</span>
{
   "_count": 2,
   "_items": [
     {
       "name": "Alice",
       "age": 30
     },
     "Bob"
   ]
}
</code></pre></div>




<a name="options"></a>
## Options

As with any other yarm resource, you can set options by using `resource.set(option, value)`.

By default, options apply both to the resource and to all sub-resources, but you can prevent the option to apply to sub-resources with `resource.set(option, value, true)`.  You can also set options only on sub-resources using `resource.sub("path/to/subresource").set(...)`.  For more information on how options work, see [Setting options](doc-extending-resources.html#setting-options).

The following options are supported by native resources:

* `rawArrays` (default `false`): when `true`, serve arrays as is instead of collections.  The whole array content will be returned to clients, instead of an object with `_count` and `_items` keys.  Note that clients cannot use `skip` or `limit` request parameters on raw arrays.

{% highlight javascript %}
yarm.native("array", [1, 2, 3])
  .set("rawArrays", true);
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/array</span>
[1, 2, 3]

<span class="p">$ curl http://localhost/rest/array?skip=1&limit=1</span>
[1, 2, 3]
</code></pre></div>

* `objectCollections` (default `false`): when `true`, serve objects as collections of their keys.  Properties can still be accessed the same way.

{% highlight javascript %}
yarm.native("object", {
  "foo": "bar",
  "sub": {
    "array": [1, 2, 3, 4, 5],
    "property": "baz"
  }
}).set("objectCollections", true);
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/object</span>
{
  "_count": 2,
  "_items": [ "foo", "sub" ]
}

<span class="p">$ curl http://localhost/rest/object/sub/property</span>
baz
</code></pre></div>

* `sparseArrays` (default `false`): when `true`, DELETE requests on array items will leave an `undefined` hole in the array instead of splicing the array.

{% highlight javascript %}
yarm.native("array", [1, 2, 3])
  .set("sparseArrays", true);
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl -X DELETE http://localhost/rest/array/1</span>
<span class="p">$ curl http://localhost/rest/array</span>
{
  "_count": 3,
  "_items": [1, undefined, 3]
}
</code></pre></div>

* `postResponse` (default `false`): when `true`, responses to POST requests will include the POSTed entity instead of being empty HTTP 201 Created responses.



<div class="footer">documentation last generated for yarm version {% include version %} on {% include gendate %}</div>

[mongoose-toobject]: http://mongoosejs.com/docs/api.html#document_Document-toObject