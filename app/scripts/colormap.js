/*global define has get isArray */

define(['plotty'], function (plotty) {

  // linear range normalizer
  var LinearNorm = function (minValue, maxValue) {
    var base = minValue;
    var scale = (minValue - maxValue) == 0 ? 0.0 : 1.0 / (maxValue - minValue);

    return function (value) {
      return (value - base) * scale;
    };
  };

  // logarithmic range normalizer
  var LogNorm = function (minValue, maxValue) {
    var normalizer = LinearNorm(Math.log10(minValue), Math.log10(maxValue));

    return function (value) {
      return normalizer(Math.log10(value));
    };
  };

  // plotty-based color-map object without the extra plotting baggage
  var ColorMap = function (name, scale) {

    if (!scale) {
      this.normalize = function (value) {return value;};
    } else if (isArray(scale)) {
      this.normalize = LinearNorm(scale[0], scale[1]);
    } else {
      this.normalize = scale;
    }

    this.canvas = get(this._colormapCanvases, name);
    if (!this.canvas) {
      if (!has(plotty.colorscales, name)) {
        throw new Error("No such color scale '" + name + "'");
      }
      this.canvas = document.createElement('canvas');
      plotty.renderColorScaleToCanvas(name, this.canvas);
      this._colormapCanvases[name] = this.canvas;
    }

    this.context = this.canvas.getContext('2d');
  };

  ColorMap.prototype = {
    _colormapCanvases: {},

    // get color-map canvas object
    getCanvas: function () {
      return this.canvas;
    },

    // map scalar value to an RGBA color
    getColor: function (value) {
      var size = this.canvas.width;
      var opaque = true;
      var index;
      var normalizedValue = this.normalize(value);
      if (normalizedValue >= 0.0) {
        if (normalizedValue < 1.0) {
          index = Math.floor(normalizedValue * size);
        } else { // normalizedValue >= 1.0
          index = size - 1;
          // make values above the upper bound fully transparent
          opaque = (normalizedValue == 1.0);
        }
      } else if (normalizedValue < 0.0) {
        index = 0;
        // make values below the lower bound fully transparent
        opaque = false;
      } else { // not a number
        return [0, 0, 0, 0];
      }
      // extract single pixel from the canvas
      var color = this.context.getImageData(index, 0, 1, 1).data;
      return [color[0], color[1], color[2], opaque * color[3]];
    }
  };

  return {
    LinearNorm: LinearNorm,
    LogNorm: LogNorm,
    ColorMap: ColorMap
  };
});
