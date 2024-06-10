(function () {
  'use strict';


  var root = this;
  root.define([
    'backbone',
    'communicator',
    'globals',
    'underscore'
  ],
  function (Backbone, Communicator, globals) {

    var StoryBannerView = Backbone.Marionette.ItemView.extend({
      tagName: "article",
      id: "story",

      events: {
        //'scroll': 'onScroll'
        /*"click #btn-select-all-coverages": "onSelectAllCoveragesClicked",
        "click #btn-invert-coverage-selection": "onInvertCoverageSelectionClicked",
        'change input[type="checkbox"]': "onCoverageSelected",
        "click #btn-start-download": "onStartDownloadClicked"*/
      },

      initialize: function (options) {

      },

      onShow: function (view) {

        $("#storyView").css({
          display: "block",
          visibility: "visible"
        });

        // Bind scroll event of parent element
        $("#story").bind("scroll", this.onScroll.bind(this));

        $(".close").bind("click", this.onClose.bind(this));

        // Array of story section elements.
        this.sections = $('section');
        _(this.sections).each(function (s) {s.wasActive = false;});

        // Set first element as active
        this.setActive(0);
      },

      onScroll: function (evt) {

        var story = document.getElementById('story');

        // All Browsers, might not work on IE8
        var y = story.scrollTop;
        var h = story.offsetHeight;

        // If scrolled to the very top of the page set the first section active.
        if (y === 0) return this.setActive(0);

        // Otherwise, conditionally determine the extent to which page must be
        // scrolled for each section. The first section that matches the current
        // scroll position wins and exits the loop early.
        var memo = 0;
        var buffer = (h * 0.2);
        var active = _(this.sections).any(function (el, index) {
          memo += el.offsetHeight;
          return y < (memo - buffer) ? this.setActive(index) : false;
        }, this);

        // If no section was set active the user has scrolled past the last section.
        // Set the last section active.
        if (!active) this.setActive(this.sections.length - 1);
      },

      // Helper to set the active section.
      setActive: function (index) {

        // Cache the active section and only run, when it changes
        if (document.getElementById('story').dataset.active == index) return true;
        document.getElementById('story').dataset.active = index;

        // Set active class on this.sections, markers.
        _(this.sections).each(function (s) {s.className = s.className.replace(' active', '');});
        this.sections[index].className += ' active';


        // Set a body class for the active section.
        document.body.className = 'section-' + index;

        if (!this.sections[index].wasActive) {

          if (this.sections[index].hasAttribute('data-reset')) {
            Communicator.mediator.trigger("app:reset");
          }

          // Do we need to zoom?
          var doZoom = false;
          if (this.sections[index].hasAttribute('data-zoom')) {
            doZoom = true;
            var zoom = this.sections[index].getAttribute('data-zoom');
            Communicator.mediator.trigger('map:change:zoom', zoom);
          }

          var center = {};
          // Get the new center?
          var doPan = false;
          if (this.sections[index].hasAttribute('data-longitude')) {
            center.lon = this.sections[index].getAttribute('data-longitude');
            doPan = true;
          }
          if (this.sections[index].hasAttribute('data-latitude')) {
            center.lat = this.sections[index].getAttribute('data-latitude');
            doPan = true;
          }

          // Zoom / Pan
          if (doZoom) {
            if (!doPan) {
              //map.zoomTo(zoom);
            } else {
              Communicator.mediator.trigger("map:center", {
                x: center.lon, y: center.lat, l: zoom
              });
            }
          } else {
            // map.panTo(center);
          }

          // Events to fire
          if (this.sections[index].hasAttribute('data-events')) {
            var events = this.sections[index].getAttribute('data-events').split(";");
            _.each(events, function (event) {
              if (event === 'layout:switch:singleview') {
                Communicator.mediator.trigger(event, 'CesiumViewer');
              } else {
                Communicator.mediator.trigger(event);
              }
            }, this);
          }

          // Analytics selection
          if (this.sections[index].hasAttribute('data-yAxis')) {
            var yAxis = this.sections[index].getAttribute('data-yAxis').split(',');
            Communicator.mediator.trigger("change:axis:parameters", yAxis);
          }

          // Time selection
          if (this.sections[index].hasAttribute('data-time')) {
            var dates = this.sections[index].getAttribute('data-time').split('/');
            var opt = {};
            opt.start = new Date(dates[0]);
            opt.end = new Date(dates[1]);

            Communicator.mediator.trigger("date:selection:change", opt);

          }

          // Configure Layers
          if (this.sections[index].hasAttribute('data-parameter')) {
            var params = this.sections[index].getAttribute('data-parameter').split(';');

            _.each(params, function (config) {
              config = config.split(":");
              var product = _.find(globals.products.models, function (p) {return p.get("views")[0].id == config[0];});

              var options = product.get("parameters");
              var selected;

              _.each(_.keys(options), function (key) {
                if (options[key].selected)
                  selected = key;
              });

              // If length is 4 additional parameter name and value is provided
              if (config.length == 4) {
                switch (config[2]) {
                  case "range":
                    var range = config[3].split(",");
                    range = [parseFloat(range[0]), parseFloat(range[1])];
                    options[config[1]].range = range;
                    break;
                  case "height":
                    product.set("height", parseFloat(config[3]));
                    break;
                  case "coefficients_range":
                    var coef_range = config[3].split(",");
                    coef_range = [parseFloat(coef_range[0]), parseFloat(coef_range[1])];
                    product.set("coefficients_range", coef_range);
                    break;
                }
              }

              product.set("parameters", options);

              Communicator.mediator.trigger("layer:parameters:changed", product.get("name"));
              Communicator.mediator.trigger("layer:settings:changed", product.get("name"));

            }, this);

          }

          // Set active layer paramenter
          if (this.sections[index].hasAttribute('data-set-parameter')) {

            var config = this.sections[index].getAttribute('data-set-parameter').split(":");
            var product = _.find(globals.products.models, function (p) {return p.get("views")[0].id == config[0];});

            var options = product.get("parameters");
            var selected;

            _.each(_.keys(options), function (key) {
              if (options[key].selected)
                selected = key;
            });

            if (selected && selected != config[1]) {
              // Delete previously selected and select new parameter
              delete options[selected].selected;
              options[config[1]].selected = true;
            } else {
              options[config[1]].selected = true;
            }

            Communicator.mediator.trigger("layer:parameters:changed", product.get("name"));
            Communicator.mediator.trigger("layer:settings:changed", product.get("name"));


          }

          // Open settings
          if (this.sections[index].hasAttribute('data-settings')) {
            Communicator.mediator.trigger("layer:open:settings", this.sections[index].getAttribute('data-settings'));
          }

          // Activate / Deactivate satellites
          if (this.sections[index].hasAttribute('data-satellite')) {
            var satellites = this.sections[index].getAttribute('data-satellite').split(';');
            _.each(satellites, function (satellite) {
              const sat = satellite.split(':');
              // satellite:value
              if (typeof globals.swarm.satellites[sat[0]] !== 'undefined') {
                const boolTrue = (sat[1] == 'true');
                globals.swarm.satellites[sat[0]] = boolTrue;
              }
              Communicator.mediator.trigger("layers:refresh");
            }, this);
          }

          // Activate / Deactivate layers
          if (this.sections[index].hasAttribute('data-layers')) {
            var activeLayers = this.sections[index].getAttribute('data-layers').split(';');
            _.each(activeLayers, function (layer) {
              Communicator.mediator.trigger("layer:activate", layer);
            }, this);
          }



          // Setup which visualization widget is displayed in which region
          if (this.sections[index].hasAttribute('data-tl')) {
            Communicator.mediator.trigger("region:show:view", 'tl', this.sections[index].getAttribute('data-tl'));
          }
          if (this.sections[index].hasAttribute('data-tr')) {
            Communicator.mediator.trigger("region:show:view", 'tr', this.sections[index].getAttribute('data-tr'));
          }
          if (this.sections[index].hasAttribute('data-bl')) {
            Communicator.mediator.trigger("region:show:view", 'bl', this.sections[index].getAttribute('data-bl'));
          }
          if (this.sections[index].hasAttribute('data-br')) {
            Communicator.mediator.trigger("region:show:view", 'br', this.sections[index].getAttribute('data-br'));
          }

          // Load a selection specified by a json file
          if (this.sections[index].hasAttribute('data-selection')) {
            $.get(this.sections[index].getAttribute('data-selection'), function (values) {
              Communicator.mediator.trigger("map:load:geojson", values);
            });

          }

          // Create bbox selection
          if (this.sections[index].hasAttribute('data-bbox')) {
            var coords = this.sections[index].getAttribute('data-bbox').split(",");
            // Coordinates structure is created as expected by Cesium View
            var bbox = {
              n: coords[3],
              e: coords[2],
              s: coords[1],
              w: coords[0]
            };
            Communicator.mediator.trigger("selection:changed", bbox);
          }


          // Add was Active attribute to not repeat events of already activated sections
          this.sections[index].wasActive = true;
        }

        return true;
      },

      onClose: function () {
        $("#storyView").css({
          display: "none",
          visibility: "hidden"
        });
        this.close();
      }

    });
    return {'StoryBannerView': StoryBannerView};
  });
}).call(this);
