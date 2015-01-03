var pageWorkers = [];
var activePageWorkerIndex = -1;
var hotkeyWorker = null;

var RegisterHotkeys = function()
{
	var system = require("sdk/system");
	var aHotkeyWorker;
	
	switch (system.platform)
	{
		case "winnt":
			console.log("Registering global hotkeys");
			var {Cu} = require("chrome");
			var {ChromeWorker} = Cu.import("resource://gre/modules/Services.jsm", null);
			aHotkeyWorker = new ChromeWorker(require("sdk/self").data.url("windowsHotkeys.js"));
			aHotkeyWorker.addEventListener("message", EmitEventToActivePageWorker);
			break;
		default:
			console.log("Global hotkeys not supported for " + system.platform + ". Falling back to browser hotkeys");
			aHotkeyWorker = require("firefoxHotkeys.js");
			aHotkeyWorker.addEventListener(EmitEventToActivePageWorker);
	}
			
	aHotkeyWorker.postMessage("attach");
	return aHotkeyWorker;
}

var RegisterContentScripts = function(pageDomains)
{
	var pageMod = require("sdk/page-mod");
	var data = require("sdk/self").data;
	
	for(let pageDomain of pageDomains)
	{
		pageMod.PageMod(
		{
			include: "*." + pageDomain,
			exclude: new RegExp(".+(ads|counters|radioAdEmbed).+"),
			contentScriptFile: [data.url("Finder.js"), data.url(pageDomain + "-view.js"), data.url(pageDomain + "-orchestrator.js")],
			onAttach: AttachWorkerToPage
		});
	}
}

var AttachWorkerToPage = function(worker)
{
	pageWorkers.push(worker);
	activePageWorkerIndex = pageWorkers.indexOf(worker);
	
	worker.on('detach', function() {
		DetachPageWorker(this, pageWorkers);
	});
	worker.tab.on('activate', function(tab){
		ActivatePageWorker(worker);
	});
	
	if (hotkeyWorker == null) hotkeyWorker = RegisterHotkeys();
}

var ActivatePageWorker = function(worker)
{
	//only act if the array has more than one element
	if (activePageWorkerIndex > 0)
	{
		var indexOfWorker = pageWorkers.indexOf(worker);
		if (indexOfWorker != activePageWorkerIndex)
		{
			//console.log("switching from " + activePageWorkerIndex + " to " + indexOfWorker);
			pageWorkers.splice(indexOfWorker, 1);
			pageWorkers.push(worker);
		}
	}
}

//Use this to detach message worker when the media page is closed
var DetachPageWorker = function(worker, workerArray)
{
	var indexOfWorker = workerArray.indexOf(worker);
	if(indexOfWorker == -1) return;
	
	workerArray.splice(indexOfWorker, 1);
	activePageWorkerIndex = activePageWorkerIndex - 1;
	
	if (activePageWorkerIndex == -1)
	{
		hotkeyWorker.postMessage("detach");
		hotkeyWorker.removeEventListener("message", EmitEventToActivePageWorker);
		hotkeyWorker = null;
	}
}

var EmitEventToActivePageWorker = function(event)
{
	//console.log("Sending " + event.data + " to " + pageWorkers[activePageWorkerIndex].tab.url);
	pageWorkers[activePageWorkerIndex].port.emit(event.data);
}

exports.RegisterHotkeys = RegisterHotkeys;
exports.RegisterContentScripts = RegisterContentScripts;
exports.EmitEventToActivePageWorker = EmitEventToActivePageWorker;