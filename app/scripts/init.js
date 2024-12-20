(function () {
  'use strict';

  var root = this;

  root.require.config({
    urlArgs: 'bust=v3.15.0',

    waitSeconds: 120,
    /* starting point for application */
    deps: ['backbone', 'backbone.marionette', 'bootstrap', 'marionette.handlebars', 'main'],

    shim: {
      jqueryui: {
        deps: ['jquery']
      },
      jqueryuitouch: {
        deps: ['jqueryui']
      },
      handlebars: {
        exports: 'Handlebars'
      },
      filepond: {
        exports: 'FilePond',
        deps: ['jquery']
      },
      backbone: {
        deps: [
          'underscore',
          'jquery'
        ],
        exports: 'Backbone'
      },
      bootstrap: {
        deps: ['jquery'],
        exports: 'jquery'
      },
      libcoverage: {
        deps: ['backbone']/*,
                exports: 'WCS'*/
      },
      FileSaver: {
        exports: 'saveAs'
      },
      timeslider: {
        deps: ['d3']
      },
      xtk: {
        exports: 'X'
      },
      'xtk-gui': {
        exports: 'dat'
      },
      drawhelper: {
        deps: ['cesium/Cesium'],
        exports: 'DrawHelper'
      },
      analytics: {
        deps: ['d3', 'jquery', 'w2ui', 'sumoselect']
      },
      w2ui: {
        deps: ['jquery']
      },
      w2popup: {
        deps: ['w2utils', 'jquery']
      },
      plotty: {
        exports: 'plotty'
      }

    },

    paths: {
      filepond: '../filepond/dist/filepond.min',
      analytics: '../d3.Graphs/lib/scripts/av.min',
      msgpack: '../msgpack-lite/dist/msgpack.min',
      cesium: "../cesium/Build/Cesium",
      drawhelper: "../scripts/vendor/cesium_DrawHelper",
      contrib: 'contrib',
      core: 'core',
      requirejs: '../requirejs/require',
      jquery: '../jquery/dist/jquery.min',
      jqueryui: '../scripts/jquery-ui',
      jqueryuitouch: '../jqueryui-touch-punch/jquery.ui.touch-punch',
      backbone: '../backbone-amd/backbone-min',
      underscore: '../underscore-amd/underscore-min',
      choices: '../choices.js/assets/scripts/dist/choices.min',
      d3: '../d3/d3.min',
      timeslider: '../D3.TimeSlider/build/d3.timeslider',
      libcoverage: '../scripts/vendor/libcoverage/libcoverage.min',

      'FileSaver': '../FileSaver.js/dist/FileSaver.min',

      /* alias all marionette libs */
      'backbone.marionette': '../backbone.marionette/lib/core/amd/backbone.marionette.min',
      'backbone.wreqr': '../backbone.wreqr/lib/backbone.wreqr.min',
      'backbone.babysitter': '../backbone.babysitter/lib/backbone.babysitter.min',

      /* alias the bootstrap js lib */
      bootstrap: '../bootstrap/dist/js/bootstrap.min',

      /* Alias text.js for template loading and shortcut the templates dir to tmpl */
      text: '../requirejs-text/text',
      tmpl: "../templates",
      // TODO DIFFERENCE
      /* handlebars from the require handlerbars plugin below */
      handlebars: '../require-handlebars-plugin/hbs/handlebars',

      /* require handlebars plugin - Alex Sexton */
      i18nprecompile: '../require-handlebars-plugin/hbs/i18nprecompile',
      json2: '../require-handlebars-plugin/hbs/json2',
      hbs: '../require-handlebars-plugin/hbs',

      /* marionette and handlebars plugin */
      'marionette.handlebars': '../backbone.marionette.handlebars/backbone.marionette.handlebars.min',

      plotty: '../plotty/dist/plotty.min',

      sumoselect: '../sumoselect/jquery.sumoselect.min',

      w2ui: '../scripts/vendor/w2ui-fields.min',
      w2popup: '../w2ui/src/w2popup',
      w2utils: '../w2ui/src/w2utils',
      graphly: '../graphly/dist/graphly.min'

    },

    hbs: {
      disableI18n: true
    }
  });
}).call(this);
