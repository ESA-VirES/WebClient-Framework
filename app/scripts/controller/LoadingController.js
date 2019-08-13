(function() {
    'use strict';

    var root = this;

    root.require([
        'backbone',
        'communicator',
        'globals',
        'app',
        'jquery'
    ],

    function( Backbone, Communicator, globals, App) {

        var LoadingController = Backbone.Marionette.Controller.extend({
            //model: new m.SelectionModel(),
            progress_count : 0,

        initialize: function(options){
            this.listenTo(Communicator.mediator, "progress:change", this.onProgressChange);
        },

        onProgressChange: function(start) {

            if(start)
                this.progress_count+=1;
            else
                this.progress_count-=1;

            if(this.progress_count<0){
                this.progress_count = 0;
            }
            if (this.progress_count > 0) {
                $("body").addClass("wait");
                //$(document.body).css({ 'cursor': 'wait' })
                //$(document.body).css('cssText', 'cursor: wait !important');
            }else{
                $("body").removeClass("wait");
                //$(document.body).css({ 'cursor': 'default' })
                //$(document.body).css('cssText', 'cursor: default !important');
            }

        },

        });

        return new LoadingController();
    });

}).call( this );