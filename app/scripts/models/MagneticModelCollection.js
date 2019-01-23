(function () {
  'use strict';
  var root = this;
  var dependencies = [
    'backbone',
    'hbs!tmpl/wps_getModelInfo',
    'underscore'
  ];

  function init(Backbone, wps_getModelInfoTmpl) {

    function _fetch_wrapper(this_, options) {
      if (this_.isFetching) {
        return;
      }
      options = options ? _.clone(options) : {};
      var success_callback = options.success;
      var error_callback = options.error;
      _.extend(options, {
          success: function (data, textStatus, jqXHR) {
            _.extend(this_, {
              lastFetch: new Date(),
              isFetching: false,
              fetchFailed: false
            });
            if (success_callback) {
              success_callback(data, textStatus, jqXHR);
            }
            //this_.trigger('fetch:stop');
            this_.trigger('fetch:success');
          },
          error: function (jqXHR, textStatus, errorThrown) {
            _.extend(this_, {
              isFetching: false,
              fetchFailed: true
            });
            if (error_callback) {
              error_callback(jqXHR, textStatus, errorThrown);
            }
            //this_.trigger('fetch:stop');
            this_.trigger('fetch:error');
          }
      });
      _.extend(this_, {
        lastFetchAtempt: new Date(),
        isFetching: true,
        fetchFailed: null
      });
      //this_.trigger('fetch:start');
      return this_.constructor.__super__.fetch.call(this_, options);
    }

    var MagneticModelModel = Backbone.Model.extend({
      idAttribute: 'name',
      url: function () {
        return this.collection.url;
      },
      parse: function (response) {
        // When MagneticModelModel.fetch() is called response is an array with one object.
        // When MagneticModelCollection.fetch() is called response is an object.
        if (Array.isArray(response)) {
          if (response.lenght == 0) {
            response = null;
          } else {
            if (response.lenght > 0) {
              console.warn('More than one model info items received while only one expected!');
            }
            response = response[0];
          }
        }
        if(response.validity) {
          response.validity = {
            start: new Date(response.validity.start),
            end: new Date(response.validity.end)
          }
        }
        return response;
      },
      fetch: function (options) {
        // update model via the vires:get_model_data WPS process
        options = options ? _.clone(options) : {};
        var isCustomModel = this.id == this.collection.customModelId;
        if (isCustomModel && !this.has('shc')) {
          return;
        }
        _.extend(options, {
          method: 'POST',
          data: wps_getModelInfoTmpl({
            model_ids: this.id,
            shc: isCustomModel ? this.get('shc') : null,
            mimeType: 'application/json'
          })
        });
        return _fetch_wrapper(this, options);
      }
    });

    var MagneticModelCollection = Backbone.Collection.extend({
      fetch: function (options) {
        // update models via the vires:get_model_data WPS process
        options = options ? _.clone(options) : {};
        var modelIds = _.map(
          this.filter(_.bind(function (item) {
            return (item.id != this.customModelId)||(item.has('shc'));
          }, this)),
          function (item) {return item.id;}
        );
        var customModel = this.get('Custom_Model');
        _.extend(options, {
          method: 'POST',
          data: wps_getModelInfoTmpl({
            model_ids: modelIds.join(','),
            shc: customModel ? customModel.get('shc') : null,
            mimeType: 'application/json'
          })
        });
        return _fetch_wrapper(this, options);
      },
      model: MagneticModelModel
    });

    return {
      MagneticModelModel: MagneticModelModel,
      MagneticModelCollection: MagneticModelCollection
    };
  }

  root.define(dependencies, init);
}).call(this);
