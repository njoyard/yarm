/*jshint node:true */
"use strict";

var yarm = module.exports = require("./yarm");

/* Add native extension */
yarm.extend("native", require("./native"));


/* Add mongoose extensions if mongoose is present */
var hasMongoose = false;


try {
	require("mongoose");
	hasMongoose = true;
} catch(e) {}

if (hasMongoose) {
	yarm.extend("mongoose", require("./mongoose/model"));
	yarm.extend("aggregate", require("./mongoose/aggregate"));
}
