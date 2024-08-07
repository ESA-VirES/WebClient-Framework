/* global _ */

(function () {
  'use strict';

  var root = this;

  root.define([
    'backbone',
    'globals'
  ],

  function (Backbone, globals) { // initializer

    var LayerModel = Backbone.Model.extend({
      idAttribute: 'name',

      /* FIXME: This is not the way the model default are defined.
             * Setting of the model defaults as the model object attributes has
             * no effect.
            name: '',
            timeSlider: false,
            timeSliderProtocol: '',
            color: '',
            time: null,
            visible: null,
            opacity: 0,
            view: {
                id: '',
                protocol: '',
                urls: [],
                style: 'default',
                isBaseLayer: null,
                attribution: '',
                matrixSet: '',
                format: '',
                resolutions: [],
                maxExtent: [],
                projection: '',
                gutter: null,
                buffer: null,
                units: '',
                transitionEffect: '',
                isphericalMercator: null,
                wrapDateLine: null,
                zoomOffset: null,
            },
            views: [],
            download: {
                id: '',
                protocol: '',
                url: [],
            },
            processes: [],
            unit: "",
            parameters: [],
            height: 0,
            model: false,
            components: [],
            */

      getModelValidity: function () {
        var validities = _.filter(
          _.map(this.get('components') || [], function (item) {
            return globals.models.get(item.id).get('validity');
          }),
          function (item) {return item;}
        );
        if (validities.length === 0) {return null;}
        var start = _.reduce(validities, function (memo, item) {
          return item.start > memo ? item.start : memo;
        }, validities[0].start);
        var end = _.reduce(validities, function (memo, item) {
          return item.end < memo ? item.end : memo;
        }, validities[0].end);
        if (end < start) {
          start = end = new Date('0001-01-01');
        }
        return {start: start, end: end};
      },

      getTruncatedPrettyModelExpression: function (allowedLength, showDegreeRange) {
        var text = this.getPrettyModelExpression(showDegreeRange);
        var position = 0;
        var visibleLength = 0;

        var _process_single_character = function () {
          if (text[position] == '&') {
            while (text[position] != ';' && position < text.length) {
              ++position;
            }
          }
          ++position;
          ++visibleLength;
        };

        // process the string to get the trimming position
        while (position < text.length && visibleLength < allowedLength - 2) {
          _process_single_character();
        }
        var trimPosition = position;
        // process the rest of the string to get the visible length
        while (position < text.length) {
          _process_single_character();
        }

        if (visibleLength - 2 > allowedLength) {
          text = text.substring(0, trimPosition) + " &hellip;";
        }

        return text;
      },

      getPrettyModelExpression: function (showDegreeRange) {
        function _default(value, defval) {
          return (value === undefined || value === null) ? defval : value;
        }

        showDegreeRange = _default(showDegreeRange, true);

        var sign = {'+': '+', '-': '&minus;'};

        return _.map(this.get('components'), function (item, index) {
          var conf = globals.models.config[item.id];
          var model = globals.models.get(item.id).attributes;
          var modelString = [
            index > 0 || item.sign !== '+' ? sign[item.sign] + ' ' : '',
            conf.name || item.id,
          ].join('');
          if (showDegreeRange && !conf.blockDegreeSelection) {
            modelString += [
              '[',
              _default(item.parameters.min_degree, model.parameters ? model.parameters.min_degree : ''),
              ':',
              _default(item.parameters.max_degree, model.parameters ? model.parameters.max_degree : ''),
              ']'
            ].join('');
          }
          return modelString;
        }).join(' ');
      },

      getModelExpression: function (name) {
        var expression = _.map(
          this.get('components'),
          function (item) {
            var conf = globals.models.config[item.id];
            var defaults = globals.models.get(item.id).get('parameters');
            var parameters = _.extend(_.clone(defaults), item.parameters);
            var id = item.id;
            if (id.indexOf("-") !== -1) {id = '"' + id + '"';}
            var expression = item.sign + id;
            if (!conf.blockDegreeSelection) {
              expression += '(' + _.map(
                parameters,
                function (value, key) {return key + '=' + value;}
              ).join(',') + ')';
            }
            return expression;
          }
        ).join('');

        if (name) {
          expression = name + '=' + expression;
        }
        return expression;
      },

      getCustomShcIfSelected: function () {
        var customModel = this.getCustomModelIfSelected();
        return customModel ? customModel.get('shc') : null;
      },

      getCustomModelIfSelected: function () {
        return this._getCustomModelIfSelected(this.get("components"));
      },

      _getCustomModelIfSelected: function (components) {
        return _.map(
          _.filter(
            components,
            function (item) {
              return item.id === globals.models.customModelId;
            }
          ),
          function (item) {
            return globals.models.get(item.id);
          }
        )[0];
      }
    });

    return {LayerModel: LayerModel};
  });

}).call(this);
