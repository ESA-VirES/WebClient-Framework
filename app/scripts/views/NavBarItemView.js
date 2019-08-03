/* global $ _ */
(function () {
    'use strict';

    var root = this;

    root.define([
        'backbone',
        'communicator',
        'models/NavBarItemModel',
        'hbs!tmpl/NavBarItem'
    ],

    function (Backbone, Communicator, NavBarItemModel, NavBarItemTmpl) {

        var NavBarItemView = Backbone.Marionette.ItemView.extend({
            model: NavBarItemModel,
            template: {
                type: 'handlebars',
                template: NavBarItemTmpl
            },
            tagName: 'li',
            cursor: 'pointer',
            //events: {'click': 'itemClicked'},

            itemClicked: function () {
                Communicator.mediator.trigger(this.model.get('eventToRaise'), this);
            },

            initialize: function (options) {
                function getModalId(eventToRaise) {
                    var parts = eventToRaise.split(':');
                    return parts && parts[0] === 'modal' ? parts[1] : null;
                }

                if (this.model.get("subitems")) {
                    this.$el.attr("class", "dropdown");
                    this.model.set("subitems", _.map(
                        this.model.get("subitems"), function (item) {
                            if (item.eventToRaise) {
                                var modalId = getModalId(item.eventToRaise);
                                if (modalId) {
                                    item.modalId = modalId;
                                }
                            }
                            return item;
                        }
                    ));
                } else if (this.model.get("url")) {
                    this.$el.on("click", _.bind(function () {
                        window.location.href = this.model.get("url");
                    }, this));
                } else {
                    var modalId = getModalId(this.model.get("eventToRaise"));
                    if (modalId) {
                        this.$el.on("click", function () {
                            $('#' + modalId).modal('show');
                        });
                    } else {
                        this.$el.on("click", $.proxy(this.itemClicked, this));
                    }
                }
            }

        });
        return {'NavBarItemView': NavBarItemView};
    });

}).call(this);
