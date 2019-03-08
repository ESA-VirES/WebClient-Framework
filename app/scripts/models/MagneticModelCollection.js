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
          if (response.length == 0) {
            response = null;
          } else {
            if (response.length > 1) {
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
        if (response.expression) {
          // parse expression to get coefficients
          // "- 'CHAOS-6-MMA-Secondary'(max_degree=2,min_degree=0)"
          var stringToParse = response.expression;
          var indices = [stringToParse.indexOf("="),
            stringToParse.indexOf(","),
            stringToParse.lastIndexOf("="),
            stringToParse.indexOf(")")];
          var coefficients = [Number(stringToParse.slice(indices[2]+1, indices[3]))
            ,Number(stringToParse.slice(indices[0]+1, indices[1]))]
        }
        if (coefficients[0] > coefficients[1]){
          //if for somewhat reason parsed wrongly, reverse order
          coefficients.reverse();
        }
        if (!isNaN(coefficients[0]) && !isNaN(coefficients[1])){
          response.coefficients_range = coefficients;
        }
        return response;
      },
      fetch: function (options) {
        // update model via the vires:get_model_data WPS process
        options = options ? _.clone(options) : {};
        var modelContainsSHC = this.has('shc');
        var isCustomModel = this.id == this.collection.customModelId;
        if (isCustomModel && !modelContainsSHC) {
          return;
        }
        var modelId = this.id;
        if (this.has("model_expression")){
          if (this.get("model_expression") == null){
            return;
          }else{
            modelId += "=" + this.get("model_expression");
             if (this.get('model_expression').indexOf('Custom_Model') === -1){
                 modelContainsSHC = false; // do not send shc when not necessary
             }
          }
        }
        _.extend(options, {
          method: 'POST',
          data: wps_getModelInfoTmpl({
            model_ids: modelId,
            shc: modelContainsSHC ? this.get('shc') : null,
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
        //throw away Custom model without shc and composed model without expression
        var modelIds = _.map(
          this.filter(_.bind(function (item) {
            return (item.id != this.customModelId && item.get("model_expression")!==null)||(item.has('shc'));
          }, this)),        
          function (item) {
            var modelId = item.id;
            if (item.get("model_expression")){
              modelId += "=" + item.get("model_expression");
            }
              return modelId;
            }
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
