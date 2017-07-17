var regLib              = require('./regexLib');
var cfw                 = require('./checkfileWriter');
var cheerio             = require('cheerio'); 
var cheeriotableparser  = require('cheerio-tableparser');
var regLib              = require('./regexLib');
var utils               = require('./utils');


/**
 * Parses an array of html-tables into an object which gives back the 
 * an array which indexes and identifies the strings which belong to a certain table
 * also gives a 'rest'-oject which is everything which is not in these tables which contains
 * the index of the rest lines as key. 
 * @param {array of strings} linesWithTables input array which contains strings of html tables
 * @return {object} array with tables and rest
 */
function recognizeTableArrays(linesWithTables){
    var inTable=false;
    var tablesArr = [];
    var linesArr = []; //inner array for lines 
    var tablesIndex = 0;
    var rest ={};
    var infos = []; 
    function infoObject () {
        this.indexStart= null;
        this.indexStop= null;
    };
    var returnObject = {
        rest: null,         //rest of lines which not belong to tables 
        tablesArr: null,    //The recognized tables itself
        infos: null         //Contains additional informations about the table 
    }; 
    var currentInfoObject = null;

    for(var i=0;i<linesWithTables.length;i++){
        var currentline = linesWithTables[i];
        if(currentline.indexOf("<table")!=-1){
            //Table starts
            inTable = true;
            currentInfoObject = new infoObject();
            currentInfoObject.indexStart = i;
            linesArr.push(currentline);
        }else if(currentline.indexOf("</table")!=-1){
            //Table stops 
            inTable = false; 
            currentInfoObject.indexStop = i;
            linesArr.push(currentline);
            tablesArr.push(linesArr);
            infos.push(currentInfoObject);
            linesArr = []; //Refresh lines array for new table
        }else{
            if(inTable){
                linesArr.push(currentline);
            }else{
                rest[i] = currentline;
            }
        }
    }

    returnObject.tablesArr = tablesArr;
    returnObject.rest = rest;
    returnObject.infos = infos;
    return returnObject; 

}

function createParsedTables(tablesArr){
    var tablesParsed = []; 
    for(var i=0;i<tablesArr.length;i++){
        var  $ = cheerio.load(tablesArr[i].toString()); //this is too short 
        //var $ = cheerio.load(linesBeteiligungen);
        cheeriotableparser($);

        //Use the table parser
        //1st argument: false -> don't duplicate column values
        //2nd argument: false -> don't duplicate row values 
        //3rd argument: true  -> use textMode: 
        var data =  $("table").parsetable(false,false,true);
        tablesParsed.push(data);
    }
    return tablesParsed;
}

function parse_kapitalEntwicklung(tablesParsed){
    var returnObjects = [];
    function objectKapitalentwicklung(){
        this.jahr;
        this.betrag;
        this.text;
    }

    var cObject_kapitalEntw; 
    var table_kapitalEntwicklung = tablesParsed[0];


    for(var i=0;i<table_kapitalEntwicklung[0].length;i++){
        var maybeYear = table_kapitalEntwicklung[0][i].trim();
        if(maybeYear!==""){            
            //This must be a year 
            var numMatch = regLib.matchNumber(maybeYear);
            if(numMatch && numMatch.length>=1){
                if(i>0){
                     returnObjects.push(cObject_kapitalEntw); //Push intermediate objects
                }
                cObject_kapitalEntw = new objectKapitalentwicklung();
                cObject_kapitalEntw.jahr = maybeYear;
            } 
        } 
        var maybeText =table_kapitalEntwicklung[1][i].trim();       
        if(maybeText!==""){
            if(!cObject_kapitalEntw.text){
                cObject_kapitalEntw.text = [];
            }
            cObject_kapitalEntw.text.push( maybeText);
        }
        
        var maybeBetrag =table_kapitalEntwicklung[2][i].trim();       
        if(maybeBetrag!==""){
            cObject_kapitalEntw.betrag = maybeBetrag;
        }
    }
    returnObjects.push(cObject_kapitalEntw); //Push the last object
    //Delete empty objects
    returnObjects = utils.removeEmptyEntriesFromArray(returnObjects);
    return returnObjects;
}



module.exports = {
    recognizeTableArrays, 
    createParsedTables,
    parse_kapitalEntwicklung
}