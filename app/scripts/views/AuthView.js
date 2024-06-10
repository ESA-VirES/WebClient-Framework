(function () {
  'use strict';


  var root = this;
  root.define([
    'backbone',
    'communicator',
    'globals',
    'hbs!tmpl/iFrame',
    'underscore'
  ],
  function (Backbone, Communicator, globals, iFrameTmpl) {

    var AuthView = Backbone.Marionette.ItemView.extend({

      className: "panel panel-default authview not-selectable",

      /*events: {
        "load": "onLoadiFrame",
      },*/

      initialize: function (options) {
        this.layerprop = options.layerprop;
      },
      onShow: function (view) {

        this.$('.close').on("click", _.bind(this.onClose, this));
        this.$el.draggable({
          containment: "#content",
          scroll: false,
          handle: '.panel-heading'
        });

        //this.loadcounter = 0;

        $('#authiframe').load(function () {

          var layer = globals.products.find(function (model) {return model.get('name') == this.layerprop.name;}.bind(this));
          var url = layer.get('views')[0].urls[0] + "?";
          layer = layer.get('views')[0].id;

          var req = "LAYERS=" + layer + "&TRANSPARENT=true&FORMAT=image%2Fpng&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A4326";
          req += "&BBOX=33.75,56.25,33.80,56.50&WIDTH=2&HEIGHT=2";
          req = url + req;

          var that = this;

          $.ajax({
            url: req,
            type: "GET",
            suppressErrors: true,
            xhrFields: {
              withCredentials: true
            },
            success: function (xml, textStatus, xhr) {

              Communicator.mediator.trigger('map:layer:change', that.layerprop);
              that.close();
            },
            error: function (jqXHR, textStatus, errorThrown) {
              if (jqXHR.status == 403) {
                $("#error-messages").append(
                  '<div class="alert alert-warning alert-danger">' +
                        '<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>' +
                        '<strong>Warning!</strong> You are not authorized to access this product' +
                      '</div>'
                );
                that.close();
              }
            }
          });



          /*this.loadcounter++;
          console.log('loaded: '+this.loadcounter);*/
          //$('#authiframe').find("img")
          /*if(this.loadcounter ==3){
            Communicator.mediator.trigger('map:layer:change', this.layerprop);
            this.close();
          }*/


        }.bind(this));


      },

      onClose: function () {

        this.close();
      },

      onLoadiFrame: function () {
        console.log("iframe loaded");
      }

    });
    return {'AuthView': AuthView};
  });
}).call(this);
