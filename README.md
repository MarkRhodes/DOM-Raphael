DOM-Raphael
===========

A replacement for Raphael which uses DOM elements and CSS3 transitions instead of SVG.  This was developed to allow a basic SVG to render effectively on iOS using hardware accelerated transitions.

Current Limitations
-------------

* Currently only supports modern Webkit browsers (tested on Chrome 22 and iOS Safari 6).
* Text and Rect elements are the only ones supported.
* Only the SVG attributes: x, y, width, height and opacity can be animated.  In CSS these are switched for the -webkit-transform and opacity properties to ensure hardware-accelerated transitions when possible.
* You must set the viewport to the device width when rendering on iOS - this is because it uses the scale transform instead of setting the element width which causes the issue.
