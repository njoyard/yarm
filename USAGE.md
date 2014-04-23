## Table of contents

- [Installation](#installation)
- [Usage](#usage)
    - [Basics](#basics)
    - [Serving native javascript resources](#serving-native-javascript-resources)
    - [Serving mongoose models and aggregates](#serving-mongoose-models-and-aggregates)
    - [Serving custom resources](#serving-custom-resources)
    - [Extending served resources](#extending-served-resources)
- [Native resources](#native-resources)
    - [Definition](#definition)
    - [Modification](#modification)
        - [DELETE](#delete)
        - [PUT](#put)
        - [PATCH](#patch)
        - [POST](#post)
    - [Options](#options)
- [Mongoose resources](#mongoose-resources)
    - [Definition](#definition-1)
    - [Serving collections](#serving-collections)
        - [GET: retrieving multiple documents](#get-retrieving-multiple-documents)
            - [Getting specific parts of a collection](#getting-specific-parts-of-a-collection)
            - [Searching for documents](#searching-for-documents)
            - [Using a custom query](#using-a-custom-query)
            - [Sorting collections](#sorting-collections)
        - [POST: adding new documents](#post-adding-new-documents)
    - [Serving documents](#serving-documents)
        - [GET: retrieving single documents](#get-retrieving-single-documents)
        - [DELETE: removing documents](#delete-removing-documents)
        - [PUT and PATCH: updating documents](#put-and-patch-updating-documents)
    - [Serving document properties](#serving-document-properties)
        - [GET: retrieving document properties](#get-retrieving-document-properties)
        - [DELETE: removing document properties](#delete-removing-document-properties)
        - [PUT and PATCH: updating document properties](#put-and-patch-updating-document-properties)
        - [POST: adding sub-documents to document arrays](#post-adding-sub-documents-to-document-arrays)
- [Custom resources](#custom-resources)
- [Extending resources](#extending-resources)
    - [Overriding handlers](#overriding-handlers)
    - [Sub-resources](#sub-resources)
    - [Setting options](#setting-options)
    - [Hooks](#hooks)
- [Extending yarm](#extending-yarm)
- [Using multiple instances](#using-multiple-instances)


## Installation

Use npm to install yarm, or add yarm to your package.json dependencies.

```
$ npm install yarm
```

yarm has no dependencies, however it is intended to be used with Express and will have additional features if mongoose is present.



## Usage


### Basics

Use yarm as any other Express middleware.

```javascript
var app = require("express")();
var yarm = require("yarm");

app.use("/rest", yarm());
app.listen(80);
```


### Serving native javascript resources

Use `yarm.native()` to serve native Javascript objects or arrays.

```javascript
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
```

```
$ curl http://localhost/rest/me
{
  "name": "Alice",
  "age": 30
}

$ curl http://localhost/rest/me/name
Alice

$ curl http://localhost/rest/friends
{
  "_count": 2,
  "_items": [ "Bob", "Charlie" ]
}

$ curl http://localhost/rest/friends/1
Charlie
```

Head on to the [Native resources](#native-resources) chapter for more details.


### Serving mongoose models and aggregates

When mongoose is available, you can use `yarm.mongoose()` to serve models.

```javascript
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
```

```
$ curl http://localhost/rest/posts?skip=10&limit=1
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

$ curl http://localhost/rest/posts/507f191e810c19729de860ea
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

$ curl http://localhost/rest/posts/507f191e810c19729de860ea/comments/0/text
First !
```

Head on to the [Mongoose resources](#mongoose-resources) chapter for more details.


### Serving custom resources

Use `yarm.resource` to define resources with custom handlers.

```javascript
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
```

```
$ curl http://localhost/rest/greeting
{
  "hello": "world"
}

$ curl http://localhost/rest/greeting/french
{
  "bonjour": "tout le monde"
}

$ curl http://localhost/rest/greeting/pirate
{
  "arrrrr": "arrrrrr"
}
```

Head on to the [Custom resources](#custom-resources) chapter for more details.


### Extending served resources

yarm allows adding and replacing handlers for any resource or sub-resource. This enables restricting or extending the behaviour of the default native and mongoose resource handlers, as well as defining very complex custom resource hierarchies.

```javascript

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
```

Head on to the [Extending resources](#extending-resources) chapter for more details.



## Native resources


### Definition

The `yarm.native()` helper allows serving plain Javascript objects and arrays. Served object and arrays will allow access to any property path, including array indices).

```javascript
yarm.native("object", {
  foo: "bar",
  sub: {
    array: [1, 2, 3, 4, 5],
    property: "baz"
  }
});
```

```
$ curl http://localhost/rest/object
{
  "foo": "bar",
  "sub": {
    "array": [1, 2, 3, 4, 5],
    "property": "baz"
  }
}

$ curl http://localhost/rest/object/sub/property
baz

$ curl http://localhost/rest/object/sub/array/2
3
```

Arrays are served as collections, i.e. yarm will respond with a JSON object containing the total item count and a subset of the array items.

```
$ curl http://localhost/rest/object/sub/array
{
  "_count": 5,
  "_items": [1, 2, 3, 4, 5]
}
```

By default, yarm returns at most 10 items in collection responses.  You can change this default by passing a `defaultLimit` option to the middleware.

```javascript
app.use(yarm({ defaultLimit: 100 }));
```

Clients can also specify an offset and limit when requesting collections.  The requested limit will override the default value, and requesting a limit of 0 will make yarm return all items from the collection, starting at the specified offset.  In any case, the "_count" property will always return the total item count in the collection.

```
$ curl http://localhost/rest/object/sub/array?limit=1
{
  "_count": 5,
  "_items": [1]
}

$ curl http://localhost/rest/object/sub/array?skip=2&limit=0
{
  "_count": 5,
  "_items": [3, 4, 5]
}
```


### Modification

Native yarm resources can be modified using PUT, PATCH, POST and DELETE HTTP methods.

Note that the examples below assume you have set up middleware to parse JSON request bodies (such as `express.json()` or `express.bodyParser()`).

#### DELETE

The DELETE method allows removing object properties or array items.

```
$ curl -X DELETE http://localhost/rest/object/sub/array/2
$ curl http://localhost/rest/object/sub
{
  "array": [1, 2, 4, 5],
  "property": "baz"
}

$ curl -X DELETE http://localhost/rest/object/sub/property
$ curl http://localhost/rest/object/sub
{
  "array": [1, 2, 3, 4, 5]
}
```

Note that clients cannot DELETE the root resource itself.

```
$ curl -i -X DELETE http://localhost/rest/object
HTTP/1.1 405 Method not allowed
```

#### PUT

The PUT method allows replacing object properties or array items.

```
$ curl -X PUT -d '{ "newArray": [1, 2, 3] }' http://localhost/rest/object/sub
$ curl http://localhost/rest/object/sub
{
  "newArray": [1, 2, 3]
}
```

If a `_value` key is present in the request body, its value will be used instead.  This allows passing values that are not valid JSON (eg. strings, numbers or booleans).

```
$ curl -X PUT -d '{ "_value": "foo" }' \
  http://localhost/rest/object/sub/newArray/0

$ curl http://localhost/rest/object/sub
{
  "newArray": ["foo", 2, 3]
}
```

As with the DELETE method, clients cannot PUT the root resource itself.

```
$ curl -i -X PUT -d '{}' http://localhost/rest/object
HTTP/1.1 405 Method not allowed
```

#### PATCH

The PATCH method allows adding and changing properties in an object.

```
$ curl -X PATCH -d '{"foo":"bar"}' http://localhost/rest/object/sub
$ curl http://localhost/rest/object/sub
{
  "newArray": ["foo", 2, 3],
  "foo": "bar"
}

$ curl -X PATCH -d '{"newArray":[],"num":42}' http://localhost/rest/object/sub
$ curl http://localhost/rest/object/sub
{
  "newArray": [],
  "foo": "bar",
  "num": 42
}
```

The PATCH method is only available on object sub-resources.  Attempting to PATCH the root resource or a non-object sub-resource will result in a "405 Method not allowed" response.

#### POST

The POST method allows adding items to arrays or properties to objects.

When adding items to arrays, as with the PUT method, the `_value` key in the request body will be used when it is present.

```
$ curl -X POST -d '{"name":"Alice"}' http://localhost/rest/object/sub/newArray
$ curl http://localhost/rest/object/sub/newArray
{
   "_count": 1,
   "_items": [
     { "name": "Alice"}
   ]
}

$ curl -X POST -d '{"_value":"Bob"}' http://localhost/rest/object/sub/newArray
$ curl http://localhost/rest/object/sub/newArray
{
   "_count": 2,
   "_items": [
     { "name": "Alice" },
     "Bob"
   ]
}
```

When adding properties to objects, both a `_key` and a `_value` keys must be present in the request body or yarm will respond with "400 Bad request".

```
$ curl -X POST -d '{"_key":"age","_value":30}' \
  http://localhost/rest/object/sub/newArray/0

$ curl http://localhost/rest/object/sub/newArray
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
```


### Options

As with any other yarm resource, you can set options by using `resource.set(option, value)`.

By default, options apply both to the resource and to all sub-resources, but you can prevent the option to apply to sub-resources with `resource.set(option, value, true)`.  You can also set options only on sub-resources using `resource.sub("path/to/subresource").set(...)`.  For more information on how options work, see [Setting options](#setting-options).

The following options are supported by native resources:

* `rawArrays` (default `false`): when `true`, serve arrays as is instead of collections.  The whole array content will be returned to clients, instead of an object with `_count` and `_items` keys.  Note that clients cannot use `skip` or `limit` request parameters on raw arrays.

```javascript
yarm.native("array", [1, 2, 3])
  .set("rawArrays", true);
```

```
$ curl http://localhost/rest/array
[1, 2, 3]

$ curl http://localhost/rest/array?skip=1&limit=1
[1, 2, 3]
```

* `objectCollections` (default `false`): when `true`, serve objects as collections of their keys.  Properties can still be accessed the same way.

```javascript
yarm.native("object", {
  "foo": "bar",
  "sub": {
    "array": [1, 2, 3, 4, 5],
    "property": "baz"
  }
}).set("objectCollections", true);
```

```
$ curl http://localhost/rest/object
{
  "_count": 2,
  "_items": [ "foo", "sub" ]
}

$ curl http://localhost/rest/object/sub/property
baz
```

* `sparseArrays` (default `false`): when `true`, DELETE requests on array items will leave an `undefined` hole in the array instead of splicing the array.

```javascript
yarm.native("array", [1, 2, 3])
  .set("sparseArrays", true);
```

```
$ curl -X DELETE http://localhost/rest/array/1
$ curl http://localhost/rest/array
{
  "_count": 3,
  "_items": [1, undefined, 3]
}
```

* `postResponse` (default `false`): when `true`, responses to POST requests will include the POSTed entity instead of being empty HTTP 201 Created responses.


## Mongoose resources


### Definition

When mongoose is present, you can use `yarm.mongoose` to serve models as resources.

```javascript
var Post = mongoose.model(PostSchema)
yarm.mongoose("posts", Post);
```

You can also use `yarm.aggregate` to serve aggregates as resources.  Contrary to models, aggregates are read-only: only GET requests are supported on aggregate (and sub-property) URLs.

```javascript
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
```


### Serving collections

#### GET: retrieving multiple documents

Models and aggregates are served as collections, i.e. yarm will respond with a JSON object containing the total item count and a subset of the collection items.

```
$ curl http://localhost/rest/posts
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
```

##### Getting specific parts of a collection

By default, yarm returns at most 10 items in collection responses.  You can change this default by passing a `defaultLimit` option to the middleware.

```javascript
app.use(yarm({ defaultLimit: 100 }));
```

Clients can also specify an offset and limit when requesting collections.  The requested limit will override the default value, and requesting a limit of 0 will make yarm return all items from the collection, starting at the specified offset.  In any case, the "_count" property will always return the total item count in the collection.

```
$ curl http://localhost/rest/posts?limit=1
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

$ curl http://localhost/rest/posts?skip=49&limit=0
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
```

##### Searching for documents

Clients can request documents matching a specific query in a collection using the `query` request parameter.  Here are a few examples overviewing what you can do with queries.

```
# All posts with title equal to "First post"
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
```

Clients can mix document queries with the `skip` and `limit` parameters.  The `_count` property in the returned object will always be the total number of documents matching the query in the collection.

##### Using a custom query

When serving model resources, you can alter the query used to retrieve documents by setting the `query` option on a model resource.

```javascript
yarm.mongoose("posts", Post)
  .set("query", function() {
    return Post.find({ isPublic: true });
  });
```

Aggregate resources don't support custom queries, as you can already customize the aggregation pipeline.

##### Sorting collections

When serving model resources, you could use a custom query to sort collections, but you may prefer using the `sort` option instead.

```javascript
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
```

Aggregate resources don't support a `sort` option, as you can already sort documents in the aggregation pipeline.

#### POST: adding new documents

Clients can POST new documents to model collections.

```
$ curl -X POST -d '{"title":"New Post","text":"Whatever..."}' \
  http://localhost/rest/posts

$ curl http://localhost/rest/posts?query=title:New Post
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
```

By default, a "201 Created" HTTP response is sent to the client when POSTing new documents.  This behaviour can be changed by setting the `postResponse` option to a truthy value; in this case, the created document will be returned to the client.

### Serving documents

#### GET: retrieving single documents

By default, collection documents are accessible by adding the document ObjectID value to the collection URL.

```
$ curl http://localhost/rest/posts/507f191e810c19729de860ea
{
  "_id": "507f191e810c19729de860ea",
  "title": "My first post",
  "text": "Hello, World"
}
```

If your documents have a more user-friendly identifier property, you can use the `key` option to tell `yarm.mongoose` to use this property instead.

Note that this option is not available for aggregate resources as the aggregation pipeline already allows you to map the `_id` property to whatever value you want.

```javascript
yarm.mongoose("posts", Post)
  .set("key", "postId");
```

```
$ curl http://localhost/rest/posts/my-first-post
{
  "_id": "507f191e810c19729de860ea",
  "postId": "my-first-post",
  "title": "My first post",
  "text": "Hello, World"
}
```

You can change the way yarm returns documents by using mongoose toObject option. This option can be set on the model resource directly.  Refer to the [mongoose documentation][mongoose-toobject] for more information on how this option works.

Again, this opton is not available for aggregate resources, as the aggregation pipeline already allows you to tailor documents the way you want.

```javascript
yarm.mongoose("posts", Post)
  .set("toObject", {
    // Include virtual properties in output
    virtuals: true,

    // Hide _id property
    toObject: function(doc, ret, options) {
      delete ret._id;
    }
  });
```

When the `toObject` option is set on the model resource, it will apply to responses to both collection requests and document requests.  You can specify a different toObject option for sub-resources, refer to [Setting options](#setting-options) for more information.

Before returning documents, yarm adds a `_request` property to them with the Express request object.  This allows using the request for example in a virtual property in your model.

#### DELETE: removing documents

Clients can remove documents by sending DELETE requests on the document URL.

```
$ curl -X DELETE http://localhost/rest/posts/my-first-post
$ curl -i http://localhost/rest/posts/my-first-post
HTTP/1.1 404 Not found
```

#### PUT and PATCH: updating documents

Clients can update documents by sending PUT or PATCH requests on the document URL.  For now, both methods behave as a PATCH request, that is, they update all fields that are present in the request body, without touching other fields.

```
$ curl -X PATCH -d '{"title":"New title"}' \
  http://localhost/rest/posts/507f191e810c19729de860ea
$ curl http://localhost/rest/posts/507f191e810c19729de860ea
{
  "_id": "507f191e810c19729de860ea",
  "title": "New title",
  "text": "Hello, World"
}
```

### Serving document properties

#### GET: retrieving document properties

As with native resources, clients can request any document property (or subproperty).

```
$ curl http://localhost/rest/posts/507f191e810c19729de860ea/title
My first post

$ curl http://localhost/rest/posts/507f191e810c19729de860ea/tags
["homepage", "public", "hello"]
```

When your model schema includes document arrays, they are served as collections. Clients can use the `skip`, `limit` and `query` request parameters with those collections as well.

```javascript
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
```

```
$ curl http://localhost/rest/posts/my-post/comments
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

$ curl http://localhost/rest/posts/my-post/comments?query=author:Alice
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

$ curl http://localhost/rest/posts/my-post/comments/507f191e810c19729f526a7
{
  _id: "507f191e810c19729f526a7",
  author: "Alice",
  text: "First !"
}

$ curl http://localhost/rest/posts/my-post/comments/507f191e810c19729f526a7/text
First !
```

When your model schema contains references to other collections, you may want to adjust the `query` option on the mongoose resource so that mongoose populates those references.

```javascript
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
```

#### DELETE: removing document properties

Clients can remove document properties or sub-properties by sending a DELETE request on the property URL.

```
$ curl -X DELETE http://localhost/posts/my-first-post/comments/507f191e810c19729f526a7
```

#### PUT and PATCH: updating document properties

Clients can update document properties or sub-properties by sending PUT or PATCH requests on the property URL.  If the request body contains a `_value` field, it will be used instead.  This allows passing values that would otherwise not be valid JSON (strings, numbers, booleans, ...).

```
$ curl -X PATCH -d '{"_value":"New title"}' \
  http://localhost/rest/posts/507f191e810c19729de860ea/title

$ curl http://localhost/rest/posts/507f191e810c19729de860ea
{
  "_id": "507f191e810c19729de860ea",
  "title": "New title",
  "text": "Hello, World"
}
```

#### POST: adding sub-documents to document arrays

When your schema contains a document array, clients can add new sub-documents by sending POST requests on the document array URL.

```
$ curl -X POST -d '{"author":"Bob","text":"This is a nice post !"}' \
  http://localhost/rest/posts/507f191e810c19729de860ea/comments
```


By default, a "201 Created" HTTP response is sent to the client when POSTing new sub-documents.  This behaviour can be changed by setting the `postResponse` option to a truthy value; in this case, the created sub-document will be returned to the client.



## Custom resources

You can define bare resources (that is, resources without any default method handlers) using `yarm.resource()`.

```javascript
var resource = yarm.resource("myResource");
var deepResource = yarm.resource("path/to/deep/resource");
```

The whole point of defining bare resource is to define custom handlers, which is described in the [next chapter](#extending-resources).



## Extending resources

All yarm resources share the same methods and can all be extended the same way, whether you start with a native resource, a mongoose resource, a bare resource or some resource defined using a custom extension.  Methods calls on resources can be chained, which is why any function defining a resource (including the built-in helpers) return the resource.


### Overriding handlers

Defining method handlers is just a matter of calling one of the `.get()`, `.put()`, `.post()` or `.delete()` methods on a resource.  All those methods expect a handler function as a parameter, and can be chained as they all return the resource.

```javascript
resource
  .get(function(req, cb) {
    // GET handler
  })
  .put(function(req, isPatch, cb) {
    // PUT and PATCH handler
  })
  .post(function(req, cb) {
    // POST handler
  })
  .del(function(req, cb) {
    // DELETE handler
  });
```

yarm always chooses the last defined handler for a resource, which enables overriding method handlers defined by built-in resource definition helpers.

```javascript
yarm.mongoose("posts", Post)
  .get(function(req, cb) {
    cb(null, "Overriden !");
  });
```

```
$ curl http://localhost/rest/posts
Overriden !
```

You can also remove any write handler (POST, PUT, PATCH and DELETE) using the `.readonly()` method on a resource.  This is mainly useful for resources defined using helpers (like `yarm.mongose` and `yarm.native`).

All method handlers receive the Express request object as their first parameter (with all facilities enabled by Express or any middleware used before yarm), and a callback as their last parameter.  The PUT and PATCH handler receives an additional boolean argument which indicates whether the request is a PATCH request (the handler is common because both methods work in a very similar way).

Calling the callback with an Error object as its first argument will make yarm send a HTTP 500 response, with the error message as the response body.

```javascript
yarm.resource("error")
  .get(function(req, cb) {
    cb(new Error("Oh noes !"));
  });
```

```
$ curl -i http://localhost/rest/error
HTTP/1.1 500 Internal server error
Oh noes !
```

There are several ways to call the callback with a valid response.  You can call `cb(null, body[, mimetype]);` to send the response body with an optional mimetype, where `body` can be any of:

* A string
* A Buffer instance
* A readable stream
* A plain object (which will be JSON.stringify-ed by Express)
* `null` or `undefined`, in which case yarm will send a "204 No content" response

The callback also has built-in helpers for other kinds of responses:

* `cb.file(error, filepath[, mimetype])` to send the content of a file (yarm will use Express' `res.sendfile()`)
* `cb.created()` to send a "201 Created" response
* `cb.noContent()` to send a "204 No content" response
* `cb.badRequest()` to send a "400 Bad request" response
* `cb.notFound()` to send a "404 Not found" response
* `cb.methodNotAllowed()` to send a "405 Method not allowed" response
* `cb.notImplemented()` to send a "501 Not implemented" response
* `cb.status(code[, body])` to send a custom HTTP status code and response body.
* `cb.custom(handler)` to use a custom request handler.  The handler will receive the request object, the response object and Express' `next` callback as any Express handler.

To serve a resource as a collection, you must call both its `.count()` and `.list()` methods.

```javascript
resource
  .count(function(req, cb) {
    cb(null, totalCollectionCount);
  })
  .list(function(req, offset, limit, cb) {
    cb(null, collectionItems(offset, limit));
  });
```

The handlers for the `.count()` and `.list()` methods work the same way as other handlers, except the list handler receives additional `offset` and `limit` arguments.  The offset defaults to 0 if not specified by the client, and the limit defaults to yarm defaultLimit option (default 10).  A limit of 0 indicates a request for all items until the end of the collection.  The count handler is expected to call the callback with the total item count in the collection, and the limit handler should pass an array of collection items matching the specified offset and limit.

Count/list and get handlers override each other.  You can also decide to serve the resource as a collection inside a GET handler by calling `cb.list()`.

```javascript
resource.get(function(req, cb) {
  if (req.params("asCollection")) {
    cb.list(countHandler, listHandler);
  } else {
    cb(null, "Not a collection, as requested.");
  }
});
```


### Sub-resources

There are several ways of defining handlers on a sub-resource.  You can pass the full path to `yarm.resource()`, pass the sub-path to the `.sub()` method of a resource, or chain several `.sub()` calls.  The following examples are all equivalent.

```javascript
yarm.resource("path/to/resource")
  .get(function(req, cb) {
    cb(null, "Hey !");
  });

yarm.resource("path/to")
  .sub("resource")
    .get(function(req, cb) {
      cb(null, "Hey !");
    });

yarm.resource("path")
  .sub("to/resource")
    .get(function(req, cb) {
      cb(null, "Hey !");
    });

yarm.resource("path")
  .sub("to")
    .sub("resource")
      .get(function(req, cb) {
        cb(null, "Hey !");
      });
```

yarm examines all defined handlers for the requested URL before choosing the last one.  To define (or override) a handler on a resource, you can either chain calls from the original resource definition, or restart from scratch with a new `yarm.resource()` call.

```javascript
yarm.mongoose("posts", Post)
  .get(function(req, cb) {
    cb(null, "GET /posts has been overriden");
  })
  .sub("subresource")
    .get(function(req, cb) {
      cb(null, "GET /posts/subresource has been overriden")
    });


/* yarm.resource() does not define any handlers, so any other method
   handlers will still be present */

yarm.resource("posts")
  .get(function(req, cb) {
    cb(null, "GET /posts has been overriden again");
  });

yarm.resource("posts/subresource")
  .get(function(req, cb) {
    cb(null, "GET /posts/subresource has been overriden again");
  });

yarm.resource("posts")
  .sub("subresource")
    .get(function(req, cb) {
      cb(null, "Yet another GET /posts/subresource override...");
    });
```

```
$ curl http://localhost/rest/posts
GET /posts has been overriden again

$ curl http://localhost/rest/posts/subresource
Yet another GET /posts/subresource override...
```

Paths passed to `yarm.resource()` or a resource `.sub()` method can contain parameter matching wildcards and catchall wildcards.  They work just the same as Express pattern matchers (except yarm has no support for regexps *yet*) and handlers can access the part of the URL they matched in `req.params`.

```javascript
yarm.resource("/posts/:pid/comments/:cid").get(function(req, cb) {
  cb(null, "Comment #" + req.params.cid + " from post " + req.params.pid);
});

yarm.resource("/posts/:pid").sub("comments/:cid/*").get(function(req, cb) {
  cb(null, "There's no such thing as " + req.params["*"] + " in that comment!");
});
```

```
$ curl http://localhost/rest/posts/first-post/comments/3
Comment #3 from post first-post

$ curl http://localhost/rest/posts/first-post/comments/3/foo/bar
There's no such thing as foo/bar in that comment!
```

URL parts matched with wildcards are made available in `req.params` for all handlers, including sub-resource handlers, unless the same parameter name is used more than once on the path.

```javascript
yarm.resource("post/:pid")
  .get(function(req, cb) {
    cb(null, "Post " + req.params.pid);
  })
  .sub("comments/:cid")
    .get(function(req, cb) {
      cb(null, "Comment #" + req.params.cid + " from post " + req.params.pid);
    });
```

Parameter values are URL-decoded, except for the part matched by the "*" catchall wildcard (it's up to handlers to split its value into path components and URL-decode them).

```javascript
yarm.resource("wildcard/:param")
  .get(function(req, cb) {
    cb(null, "Parameter: " + req.params.param):
  });

yarm.resource("catchall/*")
  .get(function(req, cb) {
    cb(null, "URL ends with: " + req.params["*"]);
  });
```

```
$ curl http://localhost/rest/wildcard/url%20encoded
Parameter: url encoded

$ curl http://localhost/rest/catchall/url%2Fencoded/value
URL ends with: url%2Fencoded/value
```

As stated before, yarm will always choose the last defined handler amongst all resource definitions matching the requested URL.  As a consequence, specific handlers (that is, handlers on paths without wildcards) should always be defined last or they will always be overriden by generic handlers (those with wildcards).

```javascript
yarm.resource("a/:param")
  .get(function(req, cb) {
    cb(null, "A: Generic handler");
  });

yarm.resource("a/value")
  .get(function(req, cb) {
    cb(null, "A: Specific handler");
  });

yarm.resource("b/value")
  .get(function(req, cb) {
    cb(null, "B: Specific handler");
  });

yarm.resource("b/:param")
  .get(function(req, cb) {
    cb(null, "B: Generic handler");
  });
```

```
$ curl http://localhost/rest/a/foo
A: Generic handler

$ curl http://localhost/rest/a/value
A: Specific handler

$ curl http://localhost/rest/b/foo
B: Generic handler

$ curl http://localhost/rest/b/value
B: Generic handler
```

As the "*" catchall wildcard matches everything until the end of the URL, calling `.sub()` afterwards will have no effect.

```javascript
yarm.resource("path/to/*")
  .get(function(req, cb) {
    cb(null, "Catchall handler");
  })
  .sub("bar")
    .get(function(req, cb) {
      cb(null, "Forever alone...");
    });
```

```
$ curl http://localhost/rest/path/to/foo/bar
Catchall handler
```


### Setting options

You can set options on resources and sub-resources using their `.set()` method.  Options set this way are made available to method handlers in `req.options`. yarm allows two kinds of options:

* "Deep" options are set on the resource and all its sub-resources

```javascript
resource("deep")
  .get(function(req, cb) {
    cb(null, "Option is: " + req.options["an option"])
  })
  .sub("subresource")
    .get(function(req, cb) {
      cb(null, "Option is: " + req.options["an option"])
    });

resource("deep").set("an option", "a value");
```

```
$ curl http://localhost/rest/deep
Option is: a value

$ curl http://localhost/rest/deep/subresource
Option is: a value
```

* "Strict" options are set only on the resource, and not passed to its sub-resources

```javascript
resource("strict")
  .get(function(req, cb) {
    cb(null, "Option is: " + req.options["an option"])
  })
  .sub("subresource")
    .get(function(req, cb) {
      cb(null, "Option is: " + req.options["an option"])
    });

resource("strict").set("an option", "a value", true);
```

```
$ curl http://localhost/rest/strict
Option is: a value

$ curl http://localhost/rest/strict/subresource
Option is: undefined
```

Setting options on sub-resource override those with the same name on parent resources.

```javascript
yarm.resource("option")
  .get(function(req, cb) {
    cb(null, "Option is: " + req.options["an option"])
  })
  .sub("subresource")
    .get(function(req, cb) {
      cb(null, "Option is: " + req.options["an option"])
    });

yarm.resource("option")
  .set("an option", "a value");

yarm.resource("option/subresource")
  .set("an option", "an other value")
```

```
$ curl http://localhost/rest/option
Option is: a value

$ curl http://localhost/rest/option/subresource
Option is: an other value
```


### Hooks

Hooks on yarm resources provides a way to add handlers that will be called before any method handler.  This enables altering the request object for use by the actual method handlers.

```javascript
yarm.resource("hooked")
  .hook(function(req, next) {
    req.hookCalled = true;
    next();
  })
  .get(function(req, cb) {
    cb(null, req.hookCalled ? "Hook has been called !" : "This does not work");
  })
  .post(function(req, cb) {
    cb(req.hookCalled ? null : new Error("Hook has not been called !"));
  });
```

```
$ curl http://localhost/rest/hooked
Hook has been called !

$ curl -i -X POST http://localhost/rest/hooked
HTTP/1.1 204 No content
```

Every hook receives the Express request object and a `next` callback that must be called in order to allow yarm to continue processing the request.  Hooks can also halt the handling of the request:

* Passing an Error object to `next()` will make yarm send a "500 Internal server error" response with the error message as the request body
* Calling `next.noContent()` will send a "204 No content" response
* Calling `next.badRequest()` will send a "400 Bad request" response
* Calling `next.notFound()` will send a "404 Not found" response
* Calling `next.methodNotAllowed()` will send a "405 Method not allowed" response
* Calling `next.notImplemented()` will send a "501 Not implemented" response
* Calling `next.status(code[, body])` will send a custom HTTP status code and response body.

Hooks also have access to URL wildcard values (in `req.params`) and resource options (in `req.options`).  yarm actually implements setting those objects using hooks.

Hooks are different from method handlers, in that all hooks defined on a resource path will be called when the resource is requested, including those defined on parent paths.  On a given path, hooks are called in the order they were defined.

For example, given the following resource definition:

```javascript
yarm.resource("hooks")
  .hook(rootHook1)
  .hook(rootHook2)
  .get(rootGet)
  .sub("subresource")
    .hook(subHook1)
    .hook(subHook2)
    .get(subGet);
```

a GET request on "hooks" will call `rootHook1`, `rootHook2`, and then `rootGet`.  A GET request on "hooks/subresource" will call `rootHook1`, `rootHook2`, `subHook1`, `subHook2` and finally `subGet`.

This scheme is very useful when working with nested resources, as hooks on a given level can prepare objects for the next level to work with, storing them in the request object.  For example, you could define a tree of resources to access a database with something like this:

```javascript
yarm.resource("db/:database")
  .hook(function(req, next) {
    // Connect to DB and store connection in the request object
    dbDriver.connect(req.params.database, function(err, connection) {
      if (err) {
        next(err);
      } else {
        req.connection = connection;
        next();
      }
    });
  })
  .get(function(req, cb) {
    cb(null, req.connection.getDatabaseInfo());
  })
  .post(function(req, cb) {
    req.connection.createTable(req.body.tableName, function(err) {
      cb(err);
    });
  });

yarm.resource("db/:database/tables/:table")
  .hook(function(req, next) {
    // Get a handle on the table an store it in the request object
    req.connection.getTable(req.params.table, function(err, table) {
      if (err) {
        next(err);
      } else {
        req.table = table;
        next();
      }
    });
  })
  .get(function(req, cb) {
    cb(null, req.table.getTableInfo());
  })
  .del(function(req, cb) {
    req.connection.removeTable(req.table.getTableName(), function(err) {
      cb(err);
    });
  })
  .post(function(req, cb) {
    req.table.addRow(req.body, function(err) {
      cb(err);
    });
  });

yarm.resource("db/:database/tables/:table/rows/:rowid")
  .hook(function(req, next) {
    // Get the row and store it in the request object
    req.table.fetchRow(req.params.rowid, function(err, next) {
      if (err) {
        next.notFound();
      } else {
        req.row = row;
        next();
      }
    });
  })
  .get(function(req, cb) {
    cb(null, req.row.getJSONData());
  })
  .put(function(req, isPatch, cb) {
    (isPatch ? req.row.update : req.row.replace)(req.body, function(err) {
      cb(err);
    });
  })
  .del(function(req, cb) {
    req.table.deleteRow(row.getRowID(), function(err) {
      cb(err);
    });
  });
```


### Helpers

yarm adds the following helpers to the Express request object, that are available both in hooks and in method handlers:

* `req.getHref([path])` returns the URL of the requested resource, optionnaly adding `path` to the end.

```javascript
yarm.resource("path/to/resource")
  .get(function(req, cb) {
    cb(null, {
      withoutPath: req.getHref(),
      withPath: req.getHref("sub/resource")
    });
  });
```

```
$ curl http://localhost/rest/path/to/resource
{
  "withoutPath": "http://localhost/rest/path/to/resource",
  "withPath": "http://localhost/rest/path/to/resource/sub/resource"
}
```

* `req.match(pattern, path)` matches `path` to `pattern` and returns the match.  `pattern` should be a path pattern with optional parameter or catchall wildcards.  When `path` matches, it returns an object with all matched wildcard values, or `false` otherwise. 

```javascript
yarm.resource("path/to/resource")
  .get(function(req, cb) {
    cb(null, {
      wildcards: {
        param: req.match("foo/:p1/baz/:p2", "foo/bar/baz/42"),
        wildcard: req.match("foo/:p1/baz/*", "foo/bar/baz/42/bing"),
        noMatch: req.match("foo/:p1/baz/*", "path/to/resource")
      },
      noWildcards: {
        match: req.match("path/to/resource", "path/to/resource"),
        noMatch: req.match("path/to/resource", "foo/bar")
      }
    });
  });
```

```
$ curl http://localhost/rest/path/to/resource
{
  "wildcards": {
    "param": { "p1": "bar", "p2": "42" },
    "catchall": { "p1": "bar", "*": "42/bing" },
    "noMatch": false
  },
  "noWildcards": {
    "match": {},
    "noMatch": false
  }
}
```

## Extending yarm

You can add new resource definition helpers to yarm with `yarm.extend()`, and the built-in native and mongoose helpers are actually defined this way.  This is very useful when you use the same kind of resource customization on several resources.

```javascript
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
```

```
$ curl http://localhost/rest/path/to/object
Hey !
```

## Using multiple instances

If you use the yarm middleware on multiple routes (or multiple servers), by default all resources will be shared.

```javascript
app.use("/rest1", yarm());
app.use("/rest2", yarm());

yarm.resource("hello")
  .get(function(req, cb) {
    cb(null, "Hello, world");
  });
```

```
$ curl http://localhost/rest1/hello
Hello, world

$ curl http://localhost/rest2/hello
Hello, world
```

If you want separate resources, you can create a separate yarm instance with `yarm.newInstance()`.

```javascript
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
```

```
$ curl http://localhost/rest/hello
Hello, world

$ curl -i http://localhost/rest/bonjour
HTTP/1.1 404 Not found

$ curl -i http://localhost/rest-fr/hello
HTTP/1.1 404 Not found

$ curl http://localhost/rest-fr/bonjour
Bonjour, tout le monde
```



[mongoose-toobject]: http://mongoosejs.com/docs/api.html#document_Document-toObject