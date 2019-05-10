/*global _ */

(function () {
  'use strict';
  var root = this;
  var dependencies = [
    'backbone',
    'underscore',
  ];

  function init(Backbone) {
    function _fetch_wrapper(this_, options) {
      options = options ? _.clone(options) : {};
      _.extend(options, {
        complete: function (data) {
          this_.trigger('fetch:complete');
        },
      });
      return this_.constructor.__super__.fetch.call(this_, options);
    }

    var UserDataModel = Backbone.Model.extend({
    });

    var UserDataCollection = Backbone.Collection.extend({
      model: UserDataModel,
      fetch: function (options) {
        options = options ? _.clone(options) : {};
        return _fetch_wrapper(this, options);
      },
    });

    return {
      UserDataModel: UserDataModel,
      UserDataCollection: UserDataCollection,
    };
  }
  root.define(dependencies, init);
}).call(this);
