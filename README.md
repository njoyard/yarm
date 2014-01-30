yarm
====

*Yet Another REST Middleware for node.js, Express and mongoose.*

Master branch: [![Build Status](https://travis-ci.org/njoyard/yarm.png?branch=master)](https://travis-ci.org/njoyard/yarm)

Development branch: [![Build Status](https://travis-ci.org/njoyard/yarm.png?branch=devel)](https://travis-ci.org/njoyard/yarm)



## Installation

Use npm to install yarm, or add yarm to your package.json dependencies.

```
$ npm install yarm
```

yarm has no dependencies, however it is intended to be used with Express and will have additional features if mongoose is present.



## Usage

Below is a short introduction to yarm usage, see the [complete documentation][doc] for more information.

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

Head on to the documentation on [Native resources][doc-native] for more details.


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

Head on to the documentation on [Mongoose resources][doc-mongoose] for more details.


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

Head on to the documentation on [Custom resources][doc-custom] for more details.


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

Head on to the documentation on [Extending resources][doc-extend] for more details.



## Contributing

yarm is published under the terms of the MIT license.  Feel free to report bugs or send pull requests.


[doc]: http://yarm.njoyard.fr
[doc-native]: http://yarm.njoyard.fr/doc-native-resources.html
[doc-mongoose]: http://yarm.njoyard.fr/doc-mongoose-resources.html
[doc-custom]: http://yarm.njoyard.fr/doc-custom-resources.html
[doc-extend]: http://yarm.njoyard.fr/doc-extending-resources.html
