---
layout: default
title: yarm - Mongoose resources
id: doc-mongoose-resources
---
# Mongoose resources

<a name="definition"></a>
## Definition

When mongoose is present, you can use `yarm.mongoose` to serve models as resources.

{% highlight javascript %}
var Post = mongoose.model(PostSchema)
yarm.mongoose("posts", Post);
{% endhighlight %}

You can also use `yarm.aggregate` to serve aggregates as resources.  Contrary to models, aggregates are read-only: only GET requests are supported on aggregate (and sub-property) URLs.

{% highlight javascript %}
var Post = mongoose.model(PostSchema)

// MongoDB aggregate pipeline
var pipeline = [
  { $project : {
    author : 1,
    tags : 1,
  } },
  { $unwind : "$tags" },
  { $group : {
    _id : "$tags",
    authors : { $addToSet : "$author" }
  } }
];

yarm.aggregate("authorsByTag", Post, pipeline);
{% endhighlight %}


<a name="serving-collections"></a>
## Serving collections

<a name="get-retrieving-multiple-documents"></a>
### GET: retrieving multiple documents

Models and aggregates are served as collections, i.e. yarm will respond with a JSON object containing the total item count and a subset of the collection items.

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/posts</span>
{
  "_count": 50,
  "_items": [
    {
      "_id": "507f191e810c19729de860ea",
      "title": "My first post",
      "text": "Hello, World"
    },
    {
      "_id": "507f191e810c19729de62fc7",
      "title": "My first post",
      "text": "Hello again, World"
    }
    ...
  ]
}
</code></pre></div>


<a name="getting-specific-parts-of-a-collection"></a>
#### Getting specific parts of a collection

By default, yarm returns at most 10 items in collection responses.  You can change this default by passing a `defaultLimit` option to the middleware.

{% highlight javascript %}
app.use(yarm({ defaultLimit: 100 }));
{% endhighlight %}

Clients can also specify an offset and limit when requesting collections.  The requested limit will override the default value, and requesting a limit of 0 will make yarm return all items from the collection, starting at the specified offset.  In any case, the "_count" property will always return the total item count in the collection.

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/posts?limit=1</span>
{
  "_count": 50,
  "_items": [
    {
      "_id": "507f191e810c19729de860ea",
      "title": "My first post",
      "text": "Hello, World"
    }
  ]
}

<span class="p">$ curl http://localhost/rest/posts?skip=49&limit=0</span>
{
  "_count": 50,
  "_items": [
    {
      "_id": "507f191e810c19729d5362b8",
      "title": "My 50th post",
      "text": "This is getting boring..."
    }
  ]
}
</code></pre></div>


<a name="searching-for-documents"></a>
#### Searching for documents

Clients can request documents matching a specific query in a collection using the `query` request parameter.  Here are a few examples overviewing what you can do with queries.

<div class="highlight"><pre><code># All posts with title equal to "First post"
curl http://localhost/rest/posts?query=title:First Post

# All posts not written by me
curl http://localhost/rest/posts?query=author!me

# All posts matching the regexp /post/ (make sure the client URL-encodes the
# query parameter)
curl http://localhost/rest/posts?query=title:/post/

# All posts not written by the nsa
curl  http://localhost/rest/posts?query=author!/\.nsa\.gov$/

# Regexps can be made case-insensitive
curl http://localhost/rest/posts?query=title:/post/i

# Logical expression, AND operators have priority over OR operators
curl http://localhost/rest/posts?query=title:/post/ OR text:/hello/i AND isPublic:1
</code></pre></div>

Clients can mix document queries with the `skip` and `limit` parameters.  The `_count` property in the returned object will always be the total number of documents matching the query in the collection.


<a name="using-a-custom-query"></a>
#### Using a custom query

When serving model resources, you can alter the query used to retrieve documents by setting the `query` option on a model resource.

{% highlight javascript %}
yarm.mongoose("posts", Post)
  .set("query", function() {
    return Post.find({ isPublic: true });
  });
{% endhighlight %}

Aggregate resources don't support custom queries, as you can already customize the aggregation pipeline.


<a name="sorting-collections"></a>
#### Sorting collections

When serving model resources, you could use a custom query to sort collections, but you may prefer using the `sort` option instead.

{% highlight javascript %}
// Instead of using this:
yarm.mongoose("posts", Post)
  .set("query", function() {
    return Post.find({ isPublic: true }).sort({ date: -1 });
  });

// It is easier to use the sort option
yarm.mongoose("posts", Post)
  .set("query", function() {
    return Post.find({ isPublic: true });
  })
  .set("sort", { date: -1 });
{% endhighlight %}

Aggregate resources don't support a `sort` option, as you can already sort documents in the aggregation pipeline.




<a name="post-adding-new-documents"></a>
### POST: adding new documents

Clients can POST new documents to model collections.

<div class="highlight"><pre><code><span class="p">$ curl -X POST -d '{"title":"New Post","text":"Whatever..."}' \</span>
  http://localhost/rest/posts

<span class="p">$ curl http://localhost/rest/posts?query=title:New Post</span>
{
  "_count": 1,
  "_items": [
    {
      "_id": "507f191e810c1972967fd7c3",
      "title": "New Post",
      "text": "Whatever..."
    }
  ]
}
</code></pre></div>




<a name="serving-documents"></a>
## Serving documents

<a name="get-retrieving-single-documents"></a>
### GET: retrieving single documents

By default, collection documents are accessible by adding the document ObjectID value to the collection URL.

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/posts/507f191e810c19729de860ea</span>
{
  "_id": "507f191e810c19729de860ea",
  "title": "My first post",
  "text": "Hello, World"
}
</code></pre></div>

If your documents have a more user-friendly identifier property, you can use the `key` option to tell `yarm.mongoose` to use this property instead.

Note that this option is not available for aggregate resources as the aggregation pipeline already allows you to map the `_id` property to whatever value you want.

{% highlight javascript %}
yarm.mongoose("posts", Post)
  .set("key", "postId");
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/posts/my-first-post</span>
{
  "_id": "507f191e810c19729de860ea",
  "postId": "my-first-post",
  "title": "My first post",
  "text": "Hello, World"
}
</code></pre></div>

You can change the way yarm returns documents by using mongoose toObject option. This option can be set on the model resource directly.  Refer to the [mongoose documentation][mongoose-toobject] for more information on how this option works.

Again, this opton is not available for aggregate resources, as the aggregation pipeline already allows you to tailor documents the way you want.

{% highlight javascript %}
yarm.mongoose("posts", Post)
  .set("toObject", {
    // Include virtual properties in output
    virtuals: true,

    // Hide _id property
    toObject: function(doc, ret, options) {
      delete ret._id;
    }
  });
{% endhighlight %}

When the `toObject` option is set on the model resource, it will apply to responses to both collection requests and document requests.  You can specify a different toObject option for sub-resources, refer to [Setting options](doc-extending-resources.html#setting-options) for more information.


<a name="delete-removing-documents"></a>
### DELETE: removing documents

Clients can remove documents by sending DELETE requests on the document URL.

<div class="highlight"><pre><code><span class="p">$ curl -X DELETE http://localhost/rest/posts/my-first-post</span>
<span class="p">$ curl -i http://localhost/rest/posts/my-first-post</span>
HTTP/1.1 404 Not found
</code></pre></div>


<a name="put-and-patch-updating-documents"></a>
### PUT and PATCH: updating documents

Clients can update documents by sending PUT or PATCH requests on the document URL.  For now, both methods behave as a PATCH request, that is, they update all fields that are present in the request body, without touching other fields.

<div class="highlight"><pre><code><span class="p">$ curl -X PATCH -d '{"title":"New title"}' \</span>
  http://localhost/rest/posts/507f191e810c19729de860ea
<span class="p">$ curl http://localhost/rest/posts/507f191e810c19729de860ea</span>
{
  "_id": "507f191e810c19729de860ea",
  "title": "New title",
  "text": "Hello, World"
}
</code></pre></div>




<a name="serving-document-properties"></a>
## Serving document properties

<a name="get-retrieving-document-properties"></a>
### GET: retrieving document properties

As with native resources, clients can request any document property (or subproperty).

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/posts/507f191e810c19729de860ea/title</span>
My first post

<span class="p">$ curl http://localhost/rest/posts/507f191e810c19729de860ea/tags</span>
["homepage", "public", "hello"]
</code></pre></div>

When your model schema includes document arrays, they are served as collections. Clients can use the `skip`, `limit` and `query` request parameters with those collections as well.

{% highlight javascript %}
var PostSchema = new mongoose.Schema({
  title: String,
  text: String,
  comments: [{
    author: String,
    text: String
  }]
})

var Post = mongoose.model("posts", PostSchema);

yarm.mongoose("posts", Post);
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/posts/my-post/comments</span>
{
  "_count": 3,
  "_items": [
    {
      _id: "507f191e810c19729f526a7",
      author: "Alice",
      text: "First !"
    },
    ...
  ]
}

<span class="p">$ curl http://localhost/rest/posts/my-post/comments?query=author:Alice</span>
{
  "_count": 1,
  "_items": [
    {
      _id: "507f191e810c19729f526a7",
      author: "Alice",
      text: "First !"
    }
  ]
}

<span class="p">$ curl http://localhost/rest/posts/my-post/comments/507f191e810c19729f526a7</span>
{
  _id: "507f191e810c19729f526a7",
  author: "Alice",
  text: "First !"
}

<span class="p">$ curl http://localhost/rest/posts/my-post/comments/507f191e810c19729f526a7/text</span>
First !
</code></pre></div>

When your model schema contains references to other collections, you may want to adjust the `query` option on the mongoose resource so that mongoose populates those references.

{% highlight javascript %}
var PersonSchema = new mongoose.Schema({ ... });
var Person = mongoose.model("person", PersonSchema);

var CommentSchema = new mongoose.Schema({ ... });
var Comment = mongoose.model("comment", CommentSchema);

var PostSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.types.ObjectId, ref: "person" },
  comments: [{ type: mongoose.Schema.types.ObjectId, ref: "comment" }]
});
var Post = mongoose.model("post", PostSchema);

yarm.mongoose("posts", Post)
  .set("query", function() {
    return Post.find().populate("author comments");
  });
{% endhighlight %}


<a name="delete-removing-document-properties"></a>
### DELETE: removing document properties

Clients can remove document properties or sub-properties by sending a DELETE request on the property URL.

<div class="highlight"><pre><code><span class="p">$ curl -X DELETE http://localhost/posts/my-first-post/comments/507f191e810c19729f526a7</span>
</code></pre></div>


<a name="put-and-patch-updating-document-properties"></a>
### PUT and PATCH: updating document properties

Clients can update document properties or sub-properties by sending PUT or PATCH requests on the property URL.  If the request body contains a `_value` field, it will be used instead.  This allows passing values that would otherwise not be valid JSON (strings, numbers, booleans, ...).

<div class="highlight"><pre><code><span class="p">$ curl -X PATCH -d '{"_value":"New title"}' \</span>
  http://localhost/rest/posts/507f191e810c19729de860ea/title

<span class="p">$ curl http://localhost/rest/posts/507f191e810c19729de860ea</span>
{
  "_id": "507f191e810c19729de860ea",
  "title": "New title",
  "text": "Hello, World"
}
</code></pre></div>


<a name="post-adding-sub-documents-to-document-arrays"></a>
### POST: adding sub-documents to document arrays

When your schema contains a document array, clients can add new sub-documents by sending POST requests on the document array URL.

<div class="highlight"><pre><code><span class="p">$ curl -X POST -d '{"author":"Bob","text":"This is a nice post !"}' \</span>
  http://localhost/rest/posts/507f191e810c19729de860ea/comments
</code></pre></div>





<div class="footer">documentation last generated for yarm version {% include version %} on {% include gendate %}</div>

[mongoose-toobject]: http://mongoosejs.com/docs/api.html#document_Document-toObject