var myVersion = "0.4.2", myProductName = "nodeFeedDebug", myPort = 1388;  

var http = require ("http"); 
var FeedParser = require ("feedparser");
var request = require ("request");
var urlpack = require ("url");
var utils = require ("daveutils");
const Iconv = require ('iconv').Iconv;


var config = {
	maxBodyLength: 300,
	flMaintainCalendarStructure: false
	};
var serverStats = {
	serialnum: 0,
	ctStoriesAdded: 0,
	ctStoriesAddedThisRun: 0,
	ctStoriesAddedToday: 0,
	whenLastStoryAdded: new Date (0),
	lastStoryAdded: undefined
	};
var flRiverChanged = false;

var urlFeed = "https://www.presseportal.de/rss/dienststelle_110972.rss2";

function done(err) {
	}
function getItemDescription (item) {
	var s = item.description;
	if (s == null) {
		s = "";
		}
	s = utils.stripMarkup (s);
	s = utils.trimWhitespace (s);
	if (s.length > config.maxBodyLength) {
		s = utils.trimWhitespace (utils.maxStringLength (s, config.maxBodyLength));
		}
	return (s);
	}
function getFeedTitle (urlfeed) {
	return ("title");
	}
function addToRiver (urlfeed, itemFromParser, callback) {
	var now = new Date (), item = new Object ();
	//copy selected elements from the object from feedparser, into the item for the river
		function convertOutline (jstruct) { //7/16/14 by DW
			var theNewOutline = {}, atts, subs;
			if (jstruct ["source:outline"] != undefined) {
				if (jstruct ["@"] != undefined) {
					atts = jstruct ["@"];
					subs = jstruct ["source:outline"];
					}
				else {
					atts = jstruct ["source:outline"] ["@"];
					subs = jstruct ["source:outline"] ["source:outline"];
					}
				}
			else {
				atts = jstruct ["@"];
				subs = undefined;
				}
			for (var x in atts) {
				theNewOutline [x] = atts [x];
				}
			if (subs != undefined) {
				theNewOutline.subs = [];
				if (subs instanceof Array) {
					for (var i = 0; i < subs.length; i++) {
						theNewOutline.subs [i] = convertOutline (subs [i]);
						}
					}
				else {
					theNewOutline.subs = [];
					theNewOutline.subs [0] = {};
					for (var x in subs ["@"]) {
						theNewOutline.subs [0] [x] = subs ["@"] [x];
						}
					}
				}
			return (theNewOutline);
			}
		function newConvertOutline (jstruct) { //10/16/14 by DW
			var theNewOutline = {};
			if (jstruct ["@"] != undefined) {
				utils.copyScalars (jstruct ["@"], theNewOutline);
				}
			if (jstruct ["source:outline"] != undefined) {
				if (jstruct ["source:outline"] instanceof Array) {
					var theArray = jstruct ["source:outline"];
					theNewOutline.subs = [];
					for (var i = 0; i < theArray.length; i++) {
						theNewOutline.subs [theNewOutline.subs.length] = newConvertOutline (theArray [i]);
						}
					}
				else {
					theNewOutline.subs = [
						newConvertOutline (jstruct ["source:outline"])
						];
					}
				}
			return (theNewOutline);
			}
		function getString (s) {
			if (s == null) {
				s = "";
				}
			return (utils.stripMarkup (s));
			}
		function getDate (d) {
			if (d == null) {
				d = now;
				}
			return (new Date (d))
			}
		
		item.title = getString (itemFromParser.title);
		item.link = getString (itemFromParser.link);
		item.description = getItemDescription (itemFromParser);
		
		//permalink -- updated 5/30/14 by DW
			if (itemFromParser.permalink == undefined) {
				item.permalink = "";
				}
			else {
				item.permalink = itemFromParser.permalink;
				}
			
		//enclosure -- 5/30/14 by DW
			if (itemFromParser.enclosures != undefined) { //it's an array, we want the first one
				item.enclosure = itemFromParser.enclosures [0];
				}
		//source:outline -- 7/16/14 by DW
			if (itemFromParser ["source:outline"] != undefined) { //they're using a cool feature! :-)
				item.outline = newConvertOutline (itemFromParser ["source:outline"]);
				}
		item.pubdate = getDate (itemFromParser.pubDate);
		item.comments = getString (itemFromParser.comments);
		item.feedUrl = urlfeed;
		item.when = now; //6/7/15 by DW
		item.aggregator = myProductName + " v" + myVersion;
		item.id = serverStats.serialnum++; //5/28/14 by DW
	if (config.flMaintainCalendarStructure) {
		todaysRiver [todaysRiver.length] = item;
		}
	flRiverChanged = true;
	//stats
		serverStats.ctStoriesAdded++;
		serverStats.ctStoriesAddedThisRun++;
		serverStats.ctStoriesAddedToday++;
		serverStats.whenLastStoryAdded = now;
		serverStats.lastStoryAdded = item;
	}
function getFeed (urlfeed, callback) {
	var req = request (urlfeed);
	var feedparser = new FeedParser ();
	req.on ("response", function (res) {
		var stream = this;
		if (res.statusCode == 200) {
			function maybeTranslate (res) {
				console.log ("maybeTranslate: res.headers == " + utils.jsonStringify (res.headers));
				var contentType = res.headers ["content-type"];
				if (contentType !== undefined) {
					var encoding = utils.trimWhitespace (utils.stringNthField (contentType, ";", 2));
					console.log ("maybeTranslate: encoding == " + encoding);
					if (encoding.length > 0) {
						var charset = utils.trimWhitespace (utils.stringNthField (encoding, "=", 2));
						console.log ("maybeTranslate: charset == " + charset);
						try {
							var iconv = new Iconv (charset, "utf-8");
							return (res.pipe (iconv));
							}
						catch (err) {
							console.log ("maybeTranslate: error piping through iconv, err.message == " + err.message);
							}
						}
					}
				return (res); //no translation
				}
			maybeTranslate (res).pipe (feedparser);
			}
		});
	req.on ("error", function (res) {
		console.log ("Error reading feed.");
		});
	feedparser.on ("readable", function () {
		try {
			var item = this.read (), flnew;
			if (item !== null) { //2/9/17 by DW
				callback (item);
				}
			}
		catch (err) {
			myConsoleLog ("getFeed: error == " + err.message);
			}
		});
	feedparser.on ("end", function () {
		console.log ("Feed really OK.");
		});
	feedparser.on ("error", function () {
		});
	}
function startup () {
	console.log ("\n" + myProductName + " v" + myVersion + " running on port " + myPort + ".\n");
	getFeed (urlFeed, function (data) {
		
		console.log (data.title);
		
		addToRiver (urlFeed, data);
		});
	}

startup ();
