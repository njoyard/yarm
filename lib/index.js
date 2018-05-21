import yarm from "./yarm";

let hasMongoose = false;
try {
  require("mongoose");
  hasMongoose = true;
} catch (e) {
  hasMongoose = false;
}

function instanciate() {
  let instance = yarm();

  /* Add native extension */
  instance.extend("native", require("./native"));

  /* Add mongoose extensions if mongoose is present */
  if (hasMongoose) {
    instance.extend("mongoose", require("./mongoose/model"));
    instance.extend("aggregate", require("./mongoose/aggregate"));
  }

  return instance;
}

module.exports = instanciate();
module.exports.newInstance = instanciate;
