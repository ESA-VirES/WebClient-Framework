/* global _ */

(function () {
  'use strict';
  var root = this;
  var dependencies = ['underscore'];

  function init() {
    var DONE = 4;
    var HEADERS_RECEIVED = 2;
    var OPENED = 1;

    function asyncHttpRequest(options) {
      options = _.extend({
        type: 'GET',
        responseType: 'arraybuffer',
        context: null,
        parse: function (rawData) {return rawData;},
        opened: function (xhr) {},
        success: function (data, xhr) {},
        error: function (xhr, statusText) {},
        completed: function (xhr) {}
      }, options);

      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (this.readyState === DONE) {
          if (this.status === 200) {
            options.success.call(
              options.context,
              options.parse.call(options.context, this.response, this),
              this
            );
          } else if (this.status !== 0) {
            options.error.call(options.context, this);
          }
          options.completed.call(options.context, this);
        } else if (this.readyState === HEADERS_RECEIVED) {
          if (this.status == 200) {
            this.responseType = 'arraybuffer';
          } else {
            this.responseType = 'text';
          }
        } else if (this.readyState === OPENED) {
          options.opened.call(options.context, this);
        }
      };

      xhr.open(options.type, options.url, true);
      if (options.contentType) {
        xhr.setRequestHeader("Content-Type", options.contentType);
      }
      xhr.send(options.data);

      return xhr;
    }

    return {
      asyncHttpRequest: asyncHttpRequest
    };
  }

  root.define(dependencies, init);
}).call(this);

