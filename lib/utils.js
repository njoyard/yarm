let util = require("util");

function extractRoute(req) {
  let { url, originalUrl } = req;

  return originalUrl.substring(0, originalUrl.lastIndexOf(url));
}

let utils = {
  getHref(req, urlpath) {
    return util.format(
      "%s://%s%s/%s",
      req.protocol,
      req.headers.host,
      extractRoute(req),
      urlpath
    );
  },

  addHref(req, doc, urlpath) {
    doc._href = this.getHref(req, urlpath);
  }
};

module.exports = utils;
