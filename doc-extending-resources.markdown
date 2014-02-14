---
layout: default
title: yarm - Extending resources
id: doc-extending-resources
---
# Extending resources

All yarm resources share the same methods and can all be extended the same way, whether you start with a native resource, a mongoose resource, a bare resource or some resource defined using a custom extension.  Methods calls on resources can be chained, which is why any function defining a resource (including the built-in helpers) return the resource.


<a name="overriding-handlers"></a>
## Overriding handlers

Defining method handlers is just a matter of calling one of the `.get()`, `.put()`, `.post()` or `.delete()` methods on a resource.  All those methods expect a handler function as a parameter, and can be chained as they all return the resource.

{% highlight javascript %}
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
{% endhighlight %}

yarm always chooses the last defined handler for a resource, which enables overriding method handlers defined by built-in resource definition helpers.

{% highlight javascript %}
yarm.mongoose("posts", Post)
  .get(function(req, cb) {
    cb(null, "Overriden !");
  });
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/posts</span>
Overriden !
</code></pre></div>

You can also remove any write handler (POST, PUT, PATCH and DELETE) using the `.readonly()` method on a resource.  This is mainly useful for resources defined using helpers (like `yarm.mongose` and `yarm.native`).

All method handlers receive the Express request object as their first parameter (with all facilities enabled by Express or any middleware used before yarm), and a callback as their last parameter.  The PUT and PATCH handler receives an additional boolean argument which indicates whether the request is a PATCH request (the handler is common because both methods work in a very similar way).

Calling the callback with an Error object as its first argument will make yarm send a HTTP 500 response, with the error message as the response body.

{% highlight javascript %}
yarm.resource("error")
  .get(function(req, cb) {
    cb(new Error("Oh noes !"));
  });
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl -i http://localhost/rest/error</span>
HTTP/1.1 500 Internal server error
Oh noes !
</code></pre></div>

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

{% highlight javascript %}
resource
  .count(function(req, cb) {
    cb(null, totalCollectionCount);
  })
  .list(function(req, offset, limit, cb) {
    cb(null, collectionItems(offset, limit));
  });
{% endhighlight %}

The handlers for the `.count()` and `.list()` methods work the same way as other handlers, except the list handler receives additional `offset` and `limit` arguments.  The offset defaults to 0 if not specified by the client, and the limit defaults to yarm defaultLimit option (default 10).  A limit of 0 indicates a request for all items until the end of the collection.  The count handler is expected to call the callback with the total item count in the collection, and the limit handler should pass an array of collection items matching the specified offset and limit.

Count/list and get handlers override each other.  You can also decide to serve the resource as a collection inside a GET handler by calling `cb.list()`.

{% highlight javascript %}
resource.get(function(req, cb) {
  if (req.params("asCollection")) {
    cb.list(countHandler, listHandler);
  } else {
    cb(null, "Not a collection, as requested.");
  }
});
{% endhighlight %}


<a name="sub-resources"></a>
## Sub-resources

There are several ways of defining handlers on a sub-resource.  You can pass the full path to `yarm.resource()`, pass the sub-path to the `.sub()` method of a resource, or chain several `.sub()` calls.  The following examples are all equivalent.

{% highlight javascript %}
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
{% endhighlight %}

yarm examines all defined handlers for the requested URL before choosing the last one.  To define (or override) a handler on a resource, you can either chain calls from the original resource definition, or restart from scratch with a new `yarm.resource()` call.

{% highlight javascript %}
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
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/posts</span>
GET /posts has been overriden again

<span class="p">$ curl http://localhost/rest/posts/subresource</span>
Yet another GET /posts/subresource override...
</code></pre></div>

Paths passed to `yarm.resource()` or a resource `.sub()` method can contain parameter matching wildcards and catchall wildcards.  They work just the same as Express pattern matchers (except yarm has no support for regexps *yet*) and handlers can access the part of the URL they matched in `req.params`.

{% highlight javascript %}
yarm.resource("/posts/:pid/comments/:cid").get(function(req, cb) {
  cb(null, "Comment #" + req.params.cid + " from post " + req.params.pid);
});

yarm.resource("/posts/:pid").sub("comments/:cid/*").get(function(req, cb) {
  cb(null, "There's no such thing as " + req.params["*"] + " in that comment!");
});
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/posts/first-post/comments/3</span>
Comment #3 from post first-post

<span class="p">$ curl http://localhost/rest/posts/first-post/comments/3/foo/bar</span>
There's no such thing as foo/bar in that comment!
</code></pre></div>

URL parts matched with wildcards are made available in `req.params` for all handlers, including sub-resource handlers, unless the same parameter name is used more than once on the path.

{% highlight javascript %}
yarm.resource("post/:pid")
  .get(function(req, cb) {
    cb(null, "Post " + req.params.pid);
  })
  .sub("comments/:cid")
    .get(function(req, cb) {
      cb(null, "Comment #" + req.params.cid + " from post " + req.params.pid);
    });
{% endhighlight %}

Parameter values are URL-decoded, except for the part matched by the "*" catchall wildcard (it's up to handlers to split its value into path components and URL-decode them).

{% highlight javascript %}
yarm.resource("wildcard/:param")
  .get(function(req, cb) {
    cb(null, "Parameter: " + req.params.param):
  });

yarm.resource("catchall/*")
  .get(function(req, cb) {
    cb(null, "URL ends with: " + req.params["*"]);
  });
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/wildcard/url%20encoded</span>
Parameter: url encoded

<span class="p">$ curl http://localhost/rest/catchall/url%2Fencoded/value</span>
URL ends with: url%2Fencoded/value
</code></pre></div>

As stated before, yarm will always choose the last defined handler amongst all resource definitions matching the requested URL.  As a consequence, specific handlers (that is, handlers on paths without wildcards) should always be defined last or they will always be overriden by generic handlers (those with wildcards).

{% highlight javascript %}
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
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/a/foo</span>
A: Generic handler

<span class="p">$ curl http://localhost/rest/a/value</span>
A: Specific handler

<span class="p">$ curl http://localhost/rest/b/foo</span>
B: Generic handler

<span class="p">$ curl http://localhost/rest/b/value</span>
B: Generic handler
</code></pre></div>

As the "*" catchall wildcard matches everything until the end of the URL, calling `.sub()` afterwards will have no effect.

{% highlight javascript %}
yarm.resource("path/to/*")
  .get(function(req, cb) {
    cb(null, "Catchall handler");
  })
  .sub("bar")
    .get(function(req, cb) {
      cb(null, "Forever alone...");
    });
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/path/to/foo/bar</span>
Catchall handler
</code></pre></div>


<a name="setting-options"></a>
## Setting options

You can set options on resources and sub-resources using their `.set()` method.  Options set this way are made available to method handlers in `req.options`. yarm allows two kinds of options:

* "Deep" options are set on the resource and all its sub-resources

{% highlight javascript %}
resource("deep")
  .get(function(req, cb) {
    cb(null, "Option is: " + req.options["an option"])
  })
  .sub("subresource")
    .get(function(req, cb) {
      cb(null, "Option is: " + req.options["an option"])
    });

resource("deep").set("an option", "a value");
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/deep</span>
Option is: a value

<span class="p">$ curl http://localhost/rest/deep/subresource</span>
Option is: a value
</code></pre></div>

* "Strict" options are set only on the resource, and not passed to its sub-resources

{% highlight javascript %}
resource("strict")
  .get(function(req, cb) {
    cb(null, "Option is: " + req.options["an option"])
  })
  .sub("subresource")
    .get(function(req, cb) {
      cb(null, "Option is: " + req.options["an option"])
    });

resource("strict").set("an option", "a value", true);
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/strict</span>
Option is: a value

<span class="p">$ curl http://localhost/rest/strict/subresource</span>
Option is: undefined
</code></pre></div>

Setting options on sub-resource override those with the same name on parent resources.

{% highlight javascript %}
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
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/option</span>
Option is: a value

<span class="p">$ curl http://localhost/rest/option/subresource</span>
Option is: an other value
</code></pre></div>


<a name="hooks"></a>
## Hooks

Hooks on yarm resources provides a way to add handlers that will be called before any method handler.  This enables altering the request object for use by the actual method handlers.

{% highlight javascript %}
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
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/hooked</span>
Hook has been called !

<span class="p">$ curl -i -X POST http://localhost/rest/hooked</span>
HTTP/1.1 204 No content
</code></pre></div>

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

{% highlight javascript %}
yarm.resource("hooks")
  .hook(rootHook1)
  .hook(rootHook2)
  .get(rootGet)
  .sub("subresource")
    .hook(subHook1)
    .hook(subHook2)
    .get(subGet);
{% endhighlight %}

a GET request on "hooks" will call `rootHook1`, `rootHook2`, and then `rootGet`.  A GET request on "hooks/subresource" will call `rootHook1`, `rootHook2`, `subHook1`, `subHook2` and finally `subGet`.

This scheme is very useful when working with nested resources, as hooks on a given level can prepare objects for the next level to work with, storing them in the request object.  For example, you could define a tree of resources to access a database with something like this:

{% highlight javascript %}
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
{% endhighlight %}


<a name="helpers"></a>
## Helpers

yarm adds the following helpers to the Express request object, that are available both in hooks and in method handlers:

* `req.getHref([path])` returns the URL of the requested resource, optionnaly adding `path` to the end.

{% highlight javascript %}
yarm.resource("path/to/resource")
  .get(function(req, cb) {
    cb(null, {
      withoutPath: req.getHref(),
      withPath: req.getHref("sub/resource")
    });
  });
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/path/to/resource</span>
{
  "withoutPath": "http://localhost/rest/path/to/resource",
  "withPath": "http://localhost/rest/path/to/resource/sub/resource"
}
</code></pre></div>

* `req.match(pattern, path)` matches `path` to `pattern` and returns the match.  `pattern` should be a path pattern with optional parameter or catchall wildcards.  When `path` matches, it returns an object with all matched wildcard values, or `false` otherwise. 

{% highlight javascript %}
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
{% endhighlight %}

<div class="highlight"><pre><code><span class="p">$ curl http://localhost/rest/path/to/resource</span>
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
</code></pre></div>



<div class="footer">documentation last generated for yarm version {% include version %} on {% include gendate %}</div>

[mongoose-toobject]: http://mongoosejs.com/docs/api.html#document_Document-toObject