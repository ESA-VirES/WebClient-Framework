(function () {
  'use strict';

  var root = this;

  root.define([
    'backbone',
    'communicator',
    'hbs!core/ColorRamp/ColorRampControl',
    'underscore'
  ],

  function (Backbone, Communicator, ColorRampControlTmpl) {

    var ColorRampView = Backbone.Marionette.ItemView.extend({
      template: {
        type: 'handlebars',
        template: ColorRampControlTmpl
      },

      onClose: function () {
        $("#hs-slider").slider('destroy');
        $("#sat-slider").slider('destroy');
        $("#slider").slider('destroy');
      },

      onShow: function () {
        var hs = 40;
        var hVal = 360;
        var gSat = 50;
        var alphaThreshold = this.options.alphaThreshold;

        var arraySat = new Array();
        var arrayBr = new Array();
        var arrayHue = new Array();
        var arrayColor = new Array();

        arraySat[0] = 3;
        arrayBr[0] = 98;
        arrayHue[0] = 0;
        arraySat[1] = 10;
        arrayBr[1] = 94;
        arrayHue[1] = 0;
        arraySat[2] = 17;
        arrayBr[2] = 87;
        arrayHue[2] = 0;
        arraySat[3] = 22;
        arrayBr[3] = 81;
        arrayHue[3] = 0;
        arraySat[4] = 29;
        arrayBr[4] = 76;
        arrayHue[4] = 0;
        arraySat[5] = 37;
        arrayBr[5] = 70;
        arrayHue[5] = 0;
        arraySat[6] = 43;
        arrayBr[6] = 64;
        arrayHue[6] = 0;
        arraySat[7] = 47;
        arrayBr[7] = 57;
        arrayHue[7] = 0;
        arraySat[8] = 54;
        arrayBr[8] = 51;
        arrayHue[8] = 0;
        arraySat[9] = 61;
        arrayBr[9] = 44;
        arrayHue[9] = 0;
        arraySat[10] = 67;
        arrayBr[10] = 38;
        arrayHue[10] = 0;
        arraySat[11] = 75;
        arrayBr[11] = 32;
        arrayHue[11] = 0;
        arraySat[12] = 82;
        arrayBr[12] = 25;
        arrayHue[12] = 0;
        arraySat[13] = 83;
        arrayBr[13] = 19;
        arrayHue[13] = 0;
        arraySat[14] = 88;
        arrayBr[14] = 13;
        arrayHue[14] = 0;
        arraySat[15] = 100;
        arrayBr[15] = 6;
        arrayHue[15] = 0;

        function getHue(i) {
          return Math.abs(i % 360);
        }

        function toH(val) {
          if (val > 15)
            return val.toString(16).toUpperCase();
          else
            return "0" + val.toString(16).toUpperCase();
        }

        function hexToRgb(hex) {
          // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
          var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
          hex = hex.replace(shorthandRegex, function (m, r, g, b) {
            return r + r + g + g + b + b;
          });

          var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
          } : null;
        }

        function recalculate() {
          var steps = [];

          for (var i = 0; i < 16; i++) {
            arrayHue[i] = getHue(hVal - hs * (i - 8));
            var shift = (8 - Math.abs(i - 7)) * gSat / 5;
            arrayColor[i] = hsv2rgb(arrayHue[i], arraySat[i] + shift, arrayBr[i] + shift);
            var rgb_0h = toH(arrayColor[i].r) + toH(arrayColor[i].g) + toH(arrayColor[i].b);

            var elC = "c_" + i;
            var elV = "v_" + i;
            var listC = document.getElementsByClassName(elC);
            // var listV = document.getElementsByClassName(elV);
            for (var k = listC.length - 1; k >= 0; k--) {
              listC[k].style.backgroundColor = "#" + rgb_0h;
              // listV[k].innerHTML = "#" + rgb_0h;

              var fac = 1.0 / 255.0;

              var value = hexToRgb("#" + rgb_0h);

              // console.log('value: ' + value.r*fac + ', ' + value.g*fac + ', ' + value.b*fac);

              var len = steps.length;
              var step_size = 1.0 / 16.0;

              var stop = 1 - len * step_size;
              var start = stop - step_size;

              // console.log('start: ' + start + ' / stop: ' + stop);

              steps.push({
                start: start,
                stop: stop,
                color: [value.r * fac, value.g * fac, value.b * fac, 1.0]
              });
            }
          }

          var config = {
            alphaThreshold: alphaThreshold,
            steps: steps
          };
          Communicator.mediator.trigger("options:colorramp:change", config);

          //update labels
          $('#labelHV').innerHTML = hVal;
          $('#labelHS').innerHTML = hs;
          $('#labelGS').innerHTML = gSat;
        }

        function hsv2rgb(hue, sat, val) {
          var red, grn, blu, i, f, p, q, t;
          hue %= 360;
          if (val == 0) {
            return ({
              r: 0,
              g: 0,
              v: 0
            });
          }
          if (sat > 100) sat = 100;
          if (sat < 0) sat = 0;
          if (val > 100) val = 100;
          if (val < 0) val = 0;
          sat /= 100;
          val /= 100;
          hue /= 60;
          i = Math.floor(hue);
          f = hue - i;
          p = val * (1 - sat);
          q = val * (1 - (sat * f));
          t = val * (1 - (sat * (1 - f)));
          if (i == 0) {
            red = val;
            grn = t;
            blu = p;
          } else if (i == 1) {
            red = q;
            grn = val;
            blu = p;
          } else if (i == 2) {
            red = p;
            grn = val;
            blu = t;
          } else if (i == 3) {
            red = p;
            grn = q;
            blu = val;
          } else if (i == 4) {
            red = t;
            grn = p;
            blu = val;
          } else if (i == 5) {
            red = val;
            grn = p;
            blu = q;
          }
          red = Math.floor(red * 255);
          grn = Math.floor(grn * 255);
          blu = Math.floor(blu * 255);
          return ({
            r: red,
            g: grn,
            b: blu
          });
        }

        function rgb2hsv(red, grn, blu) {
          var x, val, f, i, hue, sat, val;
          red /= 255;
          grn /= 255;
          blu /= 255;
          x = Math.min(Math.min(red, grn), blu);
          val = Math.max(Math.max(red, grn), blu);
          if (x == val) {
            return ({
              h: undefined,
              s: 0,
              v: val * 100
            });
          }
          f = (red == x) ? grn - blu : ((grn == x) ? blu - red : red - grn);
          i = (red == x) ? 3 : ((grn == x) ? 5 : 1);
          hue = Math.floor((i - f / (val - x)) * 60) % 360;
          sat = Math.floor(((val - x) / val) * 100);
          val = Math.floor(val * 100);
          return ({
            h: hue,
            s: sat,
            v: val
          });
        }

        $("#hs_slider").slider({
          value: 40,
          min: 0,
          max: 50,
          step: 1,
          slide: function (event, ui) {
            hs = ui.value;
            recalculate();
          }
        });

        $("#sat_slider").slider({
          value: 50,
          min: -50,
          max: 50,
          step: 1,
          slide: function (event, ui) {
            gSat = ui.value;
            recalculate();
          }
        });

        $("#slider").slider({
          value: 360,
          min: 0,
          max: 360,
          step: 1,
          slide: function (event, ui) {
            hVal = ui.value;
            recalculate();
            $("#amount").val(ui.value);
          }
        });

        $("#alpha_slider").slider({
          value: this.options.alphaThreshold * 10,
          min: 0,
          max: 10,
          step: 0.01,
          slide: function (event, ui) {
            alphaThreshold = ui.value / 10;
            recalculate();
            $("#labelAlpha").val(ui.value);
          }
        });
      }
    });

    return {
      'ColorRampView': ColorRampView
    };

  });

}).call(this);