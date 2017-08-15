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
            if(currentInfoObject==null){
                debugger;
            }
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
/**
 * Create formatted tables objects with cheerio.js and cheeriotableparser 
 * for better interpretation, input is a tables line seperated array (html)
 * which can be obtained with 'recognizeTableArrays'.
 * 
 * @param {array of strings} tablesArr input array which contains strings of html tables
 */
function createParsedTables(tablesArr){
    var tablesParsed = []; 
    for(var i=0;i<tablesArr.length;i++){
        var  $ = cheerio.load(tablesArr[i].toString()); //this is too short 
        //var $ = cheerio.load(linesBeteiligungen);
        cheeriotableparser($);

        //Use the table parser
        //1st argument: false -> don't duplicate column values
        //2nd argument: false -> don't duplicate row values 
        //3rd argument: false  -> use textMode: 
        var data =  $("table").parsetable(false,false,false);
        tablesParsed.push(data);
    }
    return tablesParsed;
}
/**
 * Parses the first array of tables parsed in to a kapitalentwicklung object
 * @param {array} tablesParsed 
 * @returns kapitalentwicklung
 */
function parse_kapitalEntwicklung(tablesParsed,tableKapitalEntw_index){
    var returnObjects = [];
    function objectKapitalentwicklung(){
        this.jahr;
        this.betrag;
        this.text;
    }

    var cObject_kapitalEntw; 
    var table_kapitalEntwicklung = tablesParsed[tableKapitalEntw_index];
    if(!table_kapitalEntwicklung){
        debugger; //This shouldn't happen 
    }

    for(var i=0;i<table_kapitalEntwicklung[0].length;i++){
        var maybeYear = utils.htmlText2Text(table_kapitalEntwicklung[0][i]).trim();
        if(maybeYear!==""){            
            //This must be a year 
            var numMatch = regLib.matchNumber(maybeYear);
            if(numMatch && numMatch.length>=1){
                if(i>0){
                     returnObjects.push(cObject_kapitalEntw); //Push intermediate objects
                }
                cObject_kapitalEntw = new objectKapitalentwicklung();
    
                cObject_kapitalEntw.jahr = utils.htmlText2Text(maybeYear);
            } 
        } 
        if(!cObject_kapitalEntw){
            continue;   //No valid first line found ... don't do other checks 
        }
        if(table_kapitalEntwicklung[1] && table_kapitalEntwicklung[1][i]){
            try{
            var maybeText =utils.htmlText2Text(table_kapitalEntwicklung[1][i]).trim();       
            if(maybeText!==""){
                if(!cObject_kapitalEntw.text){
                    cObject_kapitalEntw.text = [];
                }
                cObject_kapitalEntw.text.push(maybeText);
            }
            }catch(e){
                debugger;
            }
        }
        if(table_kapitalEntwicklung[2] && table_kapitalEntwicklung[2][i]){
            var maybeBetrag =utils.htmlText2Text(table_kapitalEntwicklung[2][i]).trim();       
            if(maybeBetrag!==""){             
                cObject_kapitalEntw.betrag = maybeBetrag;
            }
        }
    }
    returnObjects.push(cObject_kapitalEntw); //Push the last object
    //Delete empty objects
    returnObjects = utils.removeEmptyEntriesFromArray(returnObjects);
    return returnObjects;
}

function parse_genehmKapital(tablesParsed,tablesArr,rest,infos,genehmKapitalIndex,nextTableIndex){
    var tableGenehmkapital = tablesParsed[genehmKapitalIndex];   //Table for 'Genehmigtes Kapital'
    if(!tableGenehmkapital){
        debugger; //Shouldn't happen
    }
    var returnobject = {}; 
    
    var genehmKapital = {
        betrag:null,
        bemerkung: "" 
    }
 
    //If the table has a valid header, check the table
    if(tableGenehmkapital && tableGenehmkapital[0][0].toLowerCase().indexOf("genehmigtes")!=-1){ 
        if(!tableGenehmkapital[1]){
            //Check the following table if it still contains content 
            var followUpIndex = genehmKapitalIndex+1;  
            if( followUpIndex<nextTableIndex ){
                //The next entry with recognized content is further away 
                var followUpTable = tablesParsed[followUpIndex];
                if(followUpTable && followUpTable[0]){
                    for(var i=0;i<followUpTable[0].length;i++){
                        var currentline = followUpTable[0][i];  
                        var clineText = utils.htmlText2Text(currentline).trim();
                        if(!clineText) continue;
                        genehmKapital.bemerkung = genehmKapital.bemerkung+" "+ clineText;

                    }
                }
            }
        }else{
            //parse data
            genehmKapital.betrag = utils.htmlText2Text(tableGenehmkapital[1][0]).trim();

            //If there are additional entries in the table 
            if(tableGenehmkapital[0] && tableGenehmkapital[0].length>1){
                for(var i=1;i<tableGenehmkapital[0].length;i++){
                    var tcontent = tableGenehmkapital[0][i];
                    //TODO: this can be less redundant 
                    if(!tcontent) continue;

                    var currentlines = tcontent.split("<br>");
                    for(var x=0;x<currentlines.length;x++){
                        var currentline = currentlines[x];  
                        var clineText = utils.htmlText2Text(currentline).trim();
                        if(!clineText) continue;
                        genehmKapital.bemerkung = genehmKapital.bemerkung+" "+ clineText;
                    }

                }
            }
        }
        //If there is a corresponding info object check - this means there is information, but it's not in the table directly
        if(infos[genehmKapitalIndex]){
            var restlines = getRestLines(infos[genehmKapitalIndex],rest,"<br>",infos[genehmKapitalIndex+1]);
            if(restlines && restlines.length){
                for(var i=0;i<restlines.length;i++){
                    var currentline = restlines[i].trim();
                    var clineText = utils.htmlText2Text(currentline);
                    if(!clineText) continue;
                    genehmKapital.bemerkung = genehmKapital.bemerkung+" "+ clineText;
                }
            }
        }
        
    }
    genehmKapital.bemerkung = genehmKapital.bemerkung.trim();

    if(genehmKapital.bemerkung !="" || genehmKapital.betrag !=null){
        returnobject.genehmKapital = genehmKapital;       
    }
    
    return returnobject;
}


function parse_bedingKapital(tablesParsed,tablesArr,rest,infos,bedingKapitalIndex,nextTableIndex){
    var tableBedingkapital = tablesParsed[bedingKapitalIndex];   //Table for 'Genehmigtes Kapital'
    if(!tableBedingkapital){
        debugger; //Shouldn't happen
    }
    var returnobject = {}; 
    
    var bedingkapital = {
        betrag:null,
        bemerkung: "" 
    }
 
    //If the table has a valid header, check the table
    if(tableBedingkapital && tableBedingkapital[0][0].toLowerCase().indexOf("bedingtes")!=-1){ 
        if(!tableBedingkapital[1]){
            //Check the following table if it still contains content 
            var followUpIndex = bedingKapitalIndex+1;  
            if( followUpIndex<nextTableIndex ){
                //The next entry with recognized content is further away 
                var followUpTable = tablesParsed[followUpIndex];
                if(followUpTable && followUpTable[0]){
                    for(var i=0;i<followUpTable[0].length;i++){
                        var currentline = followUpTable[0][i];  
                        var clineText = utils.htmlText2Text(currentline).trim();
                        if(!clineText) continue;
                        bedingkapital.bemerkung = bedingkapital.bemerkung+" "+ clineText;

                    }
                }
            }
        }else{
            //parse data
            bedingkapital.betrag = utils.htmlText2Text(tableBedingkapital[1][0]).trim();

            //If there are additional entries in the table 
            if(tableBedingkapital[0] && tableBedingkapital[0].length>1){
                for(var i=1;i<tableBedingkapital[0].length;i++){
                    var tcontent = tableBedingkapital[0][i];
                    //TODO: this can be less redundant 
                    if(!tcontent) continue;

                    var currentlines = tcontent.split("<br>");
                    for(var x=0;x<currentlines.length;x++){
                        var currentline = currentlines[x];  
                        var clineText = utils.htmlText2Text(currentline).trim();
                        if(!clineText) continue;
                        bedingkapital.bemerkung = bedingkapital.bemerkung+" "+ clineText;
                    }
                }
            }
        }
        //If there is a corresponding info object check - this means there is information, but it's not in the table directly
        if(infos[bedingKapitalIndex]){
            var restlines = getRestLines(infos[bedingKapitalIndex],rest,"<br>",infos[bedingKapitalIndex+1]);
            if(restlines && restlines.length){
                for(var i=0;i<restlines.length;i++){
                    var currentline = restlines[i].trim();
                    var clineText = utils.htmlText2Text(currentline);
                    if(!clineText) continue;
                    bedingkapital.bemerkung = bedingkapital.bemerkung+" "+ clineText;
                }
            }
        }
        
    }
    bedingkapital.bemerkung = bedingkapital.bemerkung.trim();

    if(bedingkapital.bemerkung !="" || bedingkapital.betrag !=null){
        returnobject.bedingkapital = bedingkapital;       
    }
    
    return returnobject;
}

function parse_besBezugsrechte(tablesParsed,tablesArr,rest,infos,besBezugsrechteIndex,nextTableIndex){
    var tableBesondereBezugsrechte = tablesParsed[besBezugsrechteIndex];   //Table for 'Genehmigtes Kapital'
    if(!tableBesondereBezugsrechte){
        debugger; //Shouldn't happen
    }
    var returnobject = {}; 
    
    var besBezugsrechte = {
        jahre:[],
        bemerkungen: []
    }
 
    //If the table has a valid header, check the table
    if(tableBesondereBezugsrechte && tableBesondereBezugsrechte[0][0].toLowerCase().indexOf("besondere")!=-1){ 
        if(tableBesondereBezugsrechte[0].length<=1){ 
            //Check the following table if it still contains content 
            var followUpIndex = besBezugsrechteIndex+1;  
            if( followUpIndex<nextTableIndex ){
                //The next entry with recognized content is further away 
                var followUpTable = tablesParsed[followUpIndex];
                if(followUpTable && followUpTable[0]){
                    for(var i=0;i<followUpTable[0].length;i++){
                        //Parse column one ..... 
                        var tcontent = followUpTable[0][i];
                        //TODO: this can be less redundant 
                        if(tcontent){
                            var currentlines = tcontent.split("<br>");
                            for(var x=0;x<currentlines.length;x++){
                                var currentline = currentlines[x];  
                                var clineText = utils.htmlText2Text(currentline).trim();
                                if(!clineText) continue;
                                besBezugsrechte.jahre.push(clineText);
                            }
                        }
                        //Parse column two ...... 
                        var tcontent2 = followUpTable[1][i];
                        //TODO: this can be less redundant 
                        if(tcontent2){
                            var currentlines2 = tcontent2.split("<br>");
                            for(var x=0;x<currentlines2.length;x++){
                                var currentline = currentlines2[x];  
                                var clineText = utils.htmlText2Text(currentline).trim();
                                if(!clineText) continue;
                                besBezugsrechte.bemerkungen.push(clineText);
                            }
                        }
                    }
                }
            }
        }else{
            //If there are additional entries in the table 
            if(tableBesondereBezugsrechte[0] && tableBesondereBezugsrechte[0].length>1){
                for(var i=1;i<tableBesondereBezugsrechte[0].length;i++){
                    //Parse column one ..... 
                    var tcontent = tableBesondereBezugsrechte[0][i];
                    //TODO: this can be less redundant 
                    if(tcontent){
                        var currentlines = tcontent.split("<br>");
                        for(var x=0;x<currentlines.length;x++){
                            var currentline = currentlines[x];  
                            var clineText = utils.htmlText2Text(currentline).trim();
                            if(!clineText) continue;
                            besBezugsrechte.jahre.push(clineText);
                        }
                    }
                    //Parse column two ...... 
                    var tcontent2 = tableBesondereBezugsrechte[1][i];
                    //TODO: this can be less redundant 
                    if(tcontent2){
                        var currentlines2 = tcontent2.split("<br>");
                        for(var x=0;x<currentlines2.length;x++){
                            var currentline = currentlines2[x];  
                            var clineText = utils.htmlText2Text(currentline).trim();
                            if(!clineText) continue;
                            besBezugsrechte.bemerkungen.push(clineText);
                        }
                    }
                }
            }
        }
        //If there is a corresponding info object check - this means there is information, but it's not in the table directly
        if(infos[besBezugsrechteIndex]){ //TODO really necessary here ? 
            var restlines = getRestLines(infos[besBezugsrechteIndex],rest,"<br>",infos[besBezugsrechteIndex+1]);
            if(restlines && restlines.length){
                for(var i=0;i<restlines.length;i++){
                    var currentline = restlines[i].trim();
                    var clineText = utils.htmlText2Text(currentline).trim();
                    if(!clineText) continue;
                    besBezugsrechte.bemerkungen.push(clineText);
                }
            }
        }
        
    }
 
    if(besBezugsrechte.bemerkungen.length >=1 || besBezugsrechte.jahre.length >=1){
        returnobject.besBezugsrechte = besBezugsrechte;       
    }
    
    return returnobject;
}

function parse_ermAktienerwerb(tablesParsed,tablesArr,rest,infos,ermaechtigungAktienErwerbIndex,nextTableIndex){
    var tableAktienerwerb = tablesParsed[ermaechtigungAktienErwerbIndex];   //Table for 'Genehmigtes Kapital'
    if(!tableAktienerwerb){
        debugger; //Shouldn't happen
    }
    var returnobject = {}; 
    
    var ermAktienerwerb = {
        text:[]
    }

    var firstlineText = utils.htmlText2Text(tableAktienerwerb[0][0]);
    //If the table has a valid header, check the table
    if(tableAktienerwerb && firstlineText.toLowerCase().indexOf("ermächtigung")!=-1){ 
        if(tableAktienerwerb[0].length<=1){ 
            //Check the following table if it still contains content 
            var followUpIndex = ermaechtigungAktienErwerbIndex+1;  
            if( followUpIndex<nextTableIndex ){
                //The next entry with recognized content is further away 
                var followUpTable = tablesParsed[followUpIndex];
                if(followUpTable && followUpTable[0]){
                    for(var i=0;i<followUpTable[0].length;i++){
                        //Parse column one ..... 
                        var tcontent = followUpTable[0][i];
                        //TODO: this can be less redundant 
                        if(tcontent){
                            var currentlines = tcontent.split("<br>");
                            for(var x=0;x<currentlines.length;x++){
                                var currentline = currentlines[x];  
                                var clineText = utils.htmlText2Text(currentline).trim();
                                if(!clineText) continue;
                                ermAktienerwerb.text.push(clineText);
                            }
                        }
                    }
                }
            }
        }else{
            //If there are additional entries in the table 
            if(tableAktienerwerb[0] && tableAktienerwerb[0].length>1){
                for(var i=1;i<tableAktienerwerb[0].length;i++){
                    //Parse column one ..... 
                    var tcontent = tableAktienerwerb[0][i];
                    //TODO: this can be less redundant 
                    if(tcontent){
                        var currentlines = tcontent.split("<br>");
                        for(var x=0;x<currentlines.length;x++){
                            var currentline = currentlines[x];  
                            var clineText = utils.htmlText2Text(currentline).trim();
                            if(!clineText) continue;
                            ermAktienerwerb.text.push(clineText);
                        }
                    }
                }
            }
        }
        //If there is a corresponding info object check - this means there is information, but it's not in the table directly
        if(infos[ermaechtigungAktienErwerbIndex]){ //TODO really necessary here ? 
            var restlines = getRestLines(infos[ermaechtigungAktienErwerbIndex],rest,"<br>",infos[ermaechtigungAktienErwerbIndex+1]);
            if(restlines && restlines.length){
                for(var i=0;i<restlines.length;i++){
                    var currentline = restlines[i].trim();
                    var clineText = utils.htmlText2Text(currentline).trim();
                    if(!clineText) continue;
                    ermAktienerwerb.text.push(clineText);
                }
            }
        }
        
    }
 
    if( ermAktienerwerb.text.length >=1){
        returnobject = ermAktienerwerb;       
    }
    
    return returnobject;
}

function parse_grundkapital(tablesParsed,tablesArr,rest,infos,tableGrundkapitalIndex){
    var tableGrundkapital = tablesParsed[tableGrundkapitalIndex];
     
    var returnobject = {}; 
    
    var grundkapital = {
        betrag:null,
        bemerkung: "" 
    }
    var stückelung; 
    var stimmrecht;

    //If the table has a valid header, check the table
    if(tableGrundkapital && tableGrundkapital[0][0].toLowerCase().indexOf("grundkapital")!=-1){ 
        //parse data
        grundkapital.betrag = utils.htmlText2Text(tableGrundkapital[1][0]);

        //If there are additional entries in the table 
        if(tableGrundkapital[0] && tableGrundkapital[0].length>1){
            for(var i=1;i<tableGrundkapital[0].length;i++){
                var tcontent = tableGrundkapital[0][i];
                //TODO: this can be less redundant 
                if(!tcontent) continue;

                var currentlines = tcontent.split("<br>");
                for(var x=0;x<currentlines.length;x++){
                    var currentline = currentlines[x];  
                    var clineText = utils.htmlText2Text(currentline);
                    
                    var maybeStückelung = getStückelung(clineText);  
                    if(maybeStückelung){ //if stückelung is found...assign
                        stückelung = maybeStückelung;
                        continue;
                    }
                    var maybeStimmrecht = getStimmrecht(clineText);
                    if(maybeStimmrecht){
                        stimmrecht = maybeStimmrecht;
                        continue;
                    }
                    //else ... 
                    grundkapital.bemerkung = grundkapital.bemerkung+" "+ clineText;
                }

            }
        }
        //If there is a corresponding info object check - this means there is information, but it's not in the table directly
        if(infos[tableGrundkapitalIndex]){
            var restlines = getRestLines(infos[tableGrundkapitalIndex],rest,"<br>",infos[tableGrundkapitalIndex+1]);
            if(restlines && restlines.length){
                for(var i=0;i<restlines.length;i++){
                    var currentline = restlines[i].trim();
                    var clineText = utils.htmlText2Text(currentline);

                    if(!clineText) continue;

                    var maybeStückelung = getStückelung(clineText);  
                    if(maybeStückelung){ //if stückelung is found...assign
                        stückelung = maybeStückelung;
                        continue;
                    }
                    var maybeStimmrecht = getStimmrecht(clineText);
                    if(maybeStimmrecht){
                        stimmrecht = maybeStimmrecht;
                        continue;
                    }
                    //else ... 
                    grundkapital.bemerkung = grundkapital.bemerkung+" "+ clineText;
                }
            }
        }
    }
    grundkapital.bemerkung = grundkapital.bemerkung.trim();

    if(grundkapital.bemerkung !="" || grundkapital.betrag !=null){
        returnobject.grundkapital = grundkapital;       
    }

    if(stimmrecht) returnobject.stimmrecht = stimmrecht;
    if(stückelung) returnobject.stückelung = stückelung;
    
    return returnobject;
}

function parse_bereinigtekurse(tablesParsed,tablesArr,rest,infos){
    if(!tablesParsed ||tablesParsed.length>1){
        debugger; //check what's going on
    }
    var tableBereinigteKurse = tablesParsed[0];

    function kursitem(){ };

    //Row indices of which assign values to kursitem variables, 
    //these are assigned by parsing the first column in the array 
    function itemIndices(){
        this.jahr=-1;
        this.kommentar=-1;
        this.hoechst= -1;
        this.tiefst= -1;
        this.ultimo= -1;
        this.assignPossibleKommentar = function(){
            if(this.jahr+1 != this.hoechst){
                this.kommentar = this.jahr+1;
            }
        }
    };
    var itemIndicesGroups =[];
      
    var returnObject = {
        kurse: [],
        notiz: null
    }; 
        
    var headerSplit = utils.htmlText2Text(rest[0]).split("Bereinigte Kurse");
    
    if(!headerSplit){
        debugger;
    }else if(headerSplit.length==1){       
       returnObject.notiz = regLib.removeParenthesis(headerSplit[0]).replace("Kurse","").trim();
    }else{
    returnObject.notiz = regLib.removeParenthesis(headerSplit[1]).trim();
    }

    for(var i=0;i<tableBereinigteKurse.length;i++){
        var currentColumn = tableBereinigteKurse[i];
        var nextColumn    = tableBereinigteKurse[i+1];

        if(i==0){
            var currentItemIndices = new itemIndices();
            //Assign the item indices
            for(var x=0;x<currentColumn.length;x++){
                //If there is a double definition of one entry the array gets reset
                var currentItem = currentColumn[x];
                var nextItem;
                if(nextColumn){
                    nextItem = nextColumn[x];
                }
                var currentItemTextLC = utils.htmlText2Text(currentItem).trim().toLowerCase();
                if(currentItem.indexOf("</b>")!=-1){ //first recognition type for year
                    if(currentItemIndices.jahr!=-1){
                        currentItemIndices.assignPossibleKommentar();
                        itemIndicesGroups.push(currentItemIndices);
                        currentItemIndices = new itemIndices();    
                    }  
                    currentItemIndices.jahr = x;
                }else if( nextItem && nextItem.indexOf("</b>")!=-1){
                    var nextItemTextLC = utils.htmlText2Text(nextItem).trim().toLowerCase();
                    if(currentItemIndices.jahr!=-1){
                        currentItemIndices.assignPossibleKommentar();
                        itemIndicesGroups.push(currentItemIndices);
                        currentItemIndices = new itemIndices();    
                    }  
                    currentItemIndices.jahr = x;
                }else if(currentItemTextLC ==="höchst"){
                    if(currentItemIndices.hoechst!=-1){
                         currentItemIndices.assignPossibleKommentar();
                         itemIndicesGroups.push(currentItemIndices);
                         currentItemIndices = new itemIndices();
                    }
                    currentItemIndices.hoechst = x;
                }else if(currentItemTextLC ==="tiefst"){
                     if(currentItemIndices.tiefst!=-1){
                        currentItemIndices.assignPossibleKommentar();
                        itemIndicesGroups.push(currentItemIndices);                        
                        currentItemIndices = new itemIndices();
                     }                   
                    currentItemIndices.tiefst = x;
                }else if(currentItemTextLC ==="ultimo"){
                    if(currentItemIndices.ultimo!=-1){
                        currentItemIndices.assignPossibleKommentar();
                        itemIndicesGroups.push(currentItemIndices);        
                        currentItemIndices = new itemIndices();
                    }                   
                    currentItemIndices.ultimo = x;
                }
                //Index position 5 or 6 as indicator for new line 

            }
            
            currentItemIndices.assignPossibleKommentar();
            itemIndicesGroups.push(currentItemIndices);
        }else{ 
            //The values get assigned to the indices here 
            var filledItem = parseColumnContentToItem(currentColumn,itemIndicesGroups);
            //Push the values to returnobject 
            returnObject = pushItemToReturnObject("kurse",filledItem,returnObject,i);
        }
    }

    returnObject.kurse = utils.removeEmptyEntriesFromArray(returnObject.kurse);
    if(utils.isObjectEmpty(returnObject.notiz)) delete returnObject.notiz  

    return returnObject;
}

function parse_dividenden(tablesParsed,tablesArr,rest,infos){
    //Row indices of which assign values to variables, 
    //these are assigned by parsing the first column in the array 
    function itemIndices(){
        this.jahr=-1;
        this.dividende=-1;
        this.bonus= -1;
        this.sonderausschuettung= -1;
        this.steuerguthaben= -1;
        this.divscheinnr= -1;
        this.extag = -1;
        this.kupon_nr = -1;
    };

    var returnObject = {
        dividenden: [],
        notiz: null
    }; 
    
    var headerSplit = utils.htmlText2Text(rest[0]).replace("/Ausschüttung","").split("Dividenden");
    
    if(!headerSplit){
        debugger;
    }else if(headerSplit.length==1){       
        returnObject.notiz = regLib.removeParenthesis(headerSplit[0]).replace("Kurse","").trim();
    }else{
        returnObject.notiz = regLib.removeParenthesis(headerSplit[1]).trim();
    }

    for(var s=0;s<tablesParsed.length;s++){
        var tableDividenden = tablesParsed[s];
        var itemIndicesGroups =[];

        for(var i=0;i<tableDividenden.length;i++){
            var currentColumn = tableDividenden[i];
            var nextColumn    = tableDividenden[i+1];
            if(i==0){
                var currentItemIndices = new itemIndices();
                //Assign the item indices
                for(var x=0;x<currentColumn.length;x++){
                    //If there is a double definition of one entry the array gets reset
                    var currentItem = currentColumn[x];
                    var nextItem;
                    if(nextColumn){
                        nextItem = nextColumn[x];
                    }
                    var currentItemTextLC = utils.htmlText2Text(currentItem).trim().toLowerCase();
                    if(currentItem.indexOf("</b>")!=-1){ //first recognition type for year
                        if(currentItemIndices.jahr!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.jahr = x;
                    }else if( nextItem && nextItem.indexOf("</b>")!=-1){
                        var nextItemTextLC = utils.htmlText2Text(nextItem).trim().toLowerCase();
                        if(currentItemIndices.jahr!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.jahr = x;
                    }else if(currentItemTextLC ==="dividende"){
                        if(currentItemIndices.dividende!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.dividende = x;
                    }else if(currentItemTextLC ==="bonus"){
                        if(currentItemIndices.bonus!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.bonus = x;
                    }else if(currentItemTextLC ==="sonderausschüttung"){
                        if(currentItemIndices.sonderausschuettung!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.sonderausschuettung = x;
                    }else if(currentItemTextLC ==="bonus"){
                        if(currentItemIndices.bonus!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.bonus = x;
                    }else if(currentItemTextLC ==="ex-tag"){
                        if(currentItemIndices.extag!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.extag = x;
                    }else if(currentItemTextLC ==="div.-schein-nr."){
                        if(currentItemIndices.divscheinnr!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.divscheinnr = x;

                    }else if(currentItemTextLC.indexOf("kupon-nr")!=-1){
                        if(currentItemIndices.kupon_nr!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.kupon_nr = x;

                    }else if(currentItemTextLC ==="steuerguthaben"||currentItemTextLC ==="St. Guthaben"){
                        if(currentItemIndices.steuerguthaben!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.steuerguthaben = x;
                    }
                    //Index position 5 or 6 as indicator for new line - 

                }
                
                itemIndicesGroups.push(currentItemIndices);
            }else{ 
                //The values get assigned to the indices here 
                var filledItem = parseColumnContentToItem(currentColumn,itemIndicesGroups);
                //Push the values to returnobject 
                returnObject = pushItemToReturnObject("dividenden",filledItem,returnObject,i);
            }  
        }
    }

    returnObject.dividenden = utils.removeEmptyEntriesFromArray(returnObject.dividenden);
    if(utils.isObjectEmpty(returnObject.notiz)) delete returnObject.notiz  

    return returnObject;
}

function parse_kennzahlen(tablesParsed,tablesArr,rest,infos){

    //Row indices of which assign values to  variables, 
    //these are assigned by parsing the first column in the array 
    function itemIndices(){
        this.jahr=-1;
        this.konzern = {
            investitionen:-1,
            jahresueberschuss: -1,
            gesamtueberschuss: -1,
            bilanzkurs: -1,
            eigenkapitalquote: -1,
            bilanzsumme: -1,
            anlagevermoegen: -1,
            eigenkapital: -1,
            umsatzerlaesse: -1
        }
        this.beschaeftigte = {
            durchschnitt: -1,
            gj_ende: -1
        }
        this.umsatzsegmente = {
            strom: -1,
            uebertragung: -1,
            sonstiges: -1,
            gesamt: -1
        }
    };

    var returnObject = {
        kennzahlen: [],
        notizen: []
    }; 

        //Find the additional information in Headerline 
    for(key in rest){
        if(rest.hasOwnProperty(key)){
            var currentRest = utils.htmlText2Text(rest[key]);
            if(currentRest && currentRest.indexOf("Kennzahlen")!=-1){
                var headline = utils.htmlText2Text(rest[0]).replace("Kennzahlen","");
                var matchPar = regLib.matchBetweenParenthesis(headline);
                debugger;
                if(matchPar[0]){
                    debugger;
                    returnObject.notizen.push(matchPar[0]);
                }               
            }else{
                returnObject.notizen.push(currentRest);
            }
        }
    }

    for(var s=0;s<tablesParsed.length;s++){
        var tableKennzahlen = tablesParsed[s];
        var itemIndicesGroups =[];

        for(var i=0;i<tableKennzahlen.length;i++){
            var currentColumn = tableKennzahlen[i];
            var nextColumn    = tableKennzahlen[i+1];
            if(i==0){
                var currentItemIndices = new itemIndices();
                //Assign the item indices
                for(var x=0;x<currentColumn.length;x++){
                    //If there is a double definition of one entry the array gets reset
                    var currentItem = currentColumn[x];
                    var nextItem;
                    if(nextColumn){
                        nextItem = nextColumn[x];
                    }
                    var currentItemTextLC = utils.htmlText2Text(currentItem).trim().toLowerCase();
                    if(currentItem.indexOf("Konzern")!=-1){ //first recognition type for year
                        if(currentItemIndices.jahr!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.jahr = x;
                    }else if( nextItem && nextItem.indexOf("</b>")!=-1){
                        var nextItemTextLC = utils.htmlText2Text(nextItem).trim().toLowerCase();
                        if(currentItemIndices.jahr!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.jahr = x;
                    }else if(currentItemTextLC.indexOf("investitionen")!=-1){
                        if(currentItemIndices.konzern.investitionen!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.konzern.investitionen = x;
                    }else if(currentItemTextLC.indexOf("jahresüberschu")!=-1){
                        if(currentItemIndices.konzern.jahresueberschuss!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.jahresueberschuss = x;
                    }else if(currentItemTextLC.indexOf("gesamtüberschu")!=-1){
                        if(currentItemIndices.konzern.gesamtueberschuss!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.gesamtueberschuss = x;
                    }else if(currentItemTextLC.indexOf("bilanzkurs")!=-1){
                        if(currentItemIndices.konzern.bilanzkurs!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.bilanzkurs = x;
                    }else if(currentItemTextLC.indexOf("eigenkapitalquote")!=-1){
                        if(currentItemIndices.konzern.eigenkapitalquote!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.eigenkapitalquote = x;
                    }else if(currentItemTextLC.indexOf("bilanzsumme")!=-1){
                        if(currentItemIndices.konzern.bilanzsumme!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.bilanzsumme = x;
                    }else if(currentItemTextLC.indexOf("anlagevermögen")!=-1){
                        if(currentItemIndices.konzern.anlagevermoegen!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.anlagevermoegen = x;
                    }else if(currentItemTextLC.indexOf("eigenkapital")!=-1){
                        if(currentItemIndices.konzern.eigenkapital!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.eigenkapital = x;
                    }else if(currentItemTextLC.indexOf("umsatzerl")!=-1){
                        if(currentItemIndices.konzern.umsatzerlaesse!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.umsatzerlaesse = x;
                    }else if(currentItemTextLC.indexOf("durchschnitt")!=-1
                            ||currentItemTextLC.indexOf("mitarbeiter")!=-1
                            ||(currentItemTextLC.indexOf("beschäftigte")!=-1 && currentItem.indexOf("<b>")==-1)){
                        if(currentItemIndices.beschaeftigte.durchschnitt!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.beschaeftigte.durchschnitt = x;
                    }else if(currentItemTextLC.indexOf("gj-ende")!=-1){
                        if(currentItemIndices.beschaeftigte.gj_ende!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.beschaeftigte.gj_ende = x;
                    }else if(currentItemTextLC.indexOf("strom")!=-1){
                        if(currentItemIndices.umsatzsegmente.strom!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.umsatzsegmente.strom = x;
                    }else if(currentItemTextLC.indexOf("bertragung")!=-1){
                        if(currentItemIndices.umsatzsegmente.uebertragung!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.umsatzsegmente.uebertragung = x;
                    }else if(currentItemTextLC.indexOf("sonstiges")!=-1){
                        if(currentItemIndices.umsatzsegmente.sonstiges!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.umsatzsegmente.sonstiges = x;
                    }else if(currentItemTextLC.indexOf("gesamt")!=-1 && currentItemTextLC.indexOf("berschuss")==-1){
                        if(currentItemIndices.umsatzsegmente.gesamt!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.umsatzsegmente.gesamt = x;
                    }         
                }
                
                itemIndicesGroups.push(currentItemIndices);
            }else{ 
                //The values get assigned to the indices here 
                var filledItem = parseColumnContentToItem(currentColumn,itemIndicesGroups);
                //Push the values to returnobject 
                returnObject = pushItemToReturnObject("kennzahlen",filledItem,returnObject,i);
            }  
        }
    }


    returnObject.kennzahlen = utils.removeEmptyEntriesFromArray(returnObject.kennzahlen);
    returnObject.notizen = utils.removeEmptyEntriesFromArray(returnObject.notizen);

    return returnObject;
}

function parse_aus_bilanzen(tablesParsed,tablesArr,rest,infos){

    //Row indices of which assign values to  variables, 
    //these are assigned by parsing the first column in the array 
    function itemIndices(){
        this.jahr=-1;
        this.aktiva = {
            anlagevermoegen:-1,
            goodwill: -1,
            sachanlagen: -1,
            beteiligungen: -1,
            vorraete: -1,
            wertpapiere_fluessigemittel: -1,
            umlaufvermoegen: -1,
            rechnungsabgrenzung: -1,
        }
        this.passiva = {
            eigenkapital: -1,
            eigenkapital_davon_gezeichnetes_kapital: -1,
            eigenkapital_davon_bilanzergebniss:-1,
            sopo_mit_ruecklageant:-1,
            investitionszueschuesse:-1,
            fremdkapital:-1,
            fremdkapital_pensionsrueckstell:-1,
            fremdkapital_andere_rueckstell:-1,
            fremdkapital_andere_verbindlichk:-1,
            fremdkapital_langfr_verbindlichk:-1,
            fremdkapital_kurzfrmfr_verbindlichk:-1,
            pensionsrueckstellungen: -1,
            rueckstellungen: -1,
            andere_rueckstellungen: -1,
            verbindlichkeiten: -1,
            verbindlichkeiten_davon_ueber_1jahr: -1,
            bilanzsumme: -1
        }
        this.notizen= []
    };
    var indexAktiva=-1;
    var indexPassiva=-1;

    var columnIdentifiers = []; //Contains identifiers for columns, if there are additional ones, than 'jahr'

    var returnObject = {
        ausBilanzen: [],
        notizen: []
    }; 

        //Find the additional information in Headerline 
    for(key in rest){
        if(rest.hasOwnProperty(key)){
            var currentRest = utils.htmlText2Text(rest[key]);
            if(currentRest && currentRest.indexOf("Aus den Bilanzen")!=-1){
                var headline = utils.htmlText2Text(rest[0]).replace("Aus den Bilanzen","");
                var matchPar = regLib.matchBetweenParenthesis(headline);
                debugger;
                if(matchPar[0]){
                    debugger;
                    returnObject.notizen.push(matchPar[0]);
                }               
            }else{
                returnObject.notizen.push(currentRest);
            }
        }
    }

    var startIncr=0; 
    if(tablesParsed.length==3){ //This means there is an additional table 
        startIncr=1;
        var numberOfColumns = tablesParsed[1].length-1; //Columns with content number 
        var numberOfIdentifiers = tablesParsed[0].length-1;
        var identifierSpan = numberOfColumns / numberOfIdentifiers;
        for(var i=1;i<tablesParsed[0].length;i++){
            var currentIdentifier = utils.htmlText2Text(tablesParsed[0][i][0]).trim();
            for(var x=0;x<identifierSpan;x++){
                columnIdentifiers.push(currentIdentifier);
            }
        }
    }

    for(var s=0+startIncr;s<tablesParsed.length;s++){
        var tableAusBilanzen = tablesParsed[s];
        var itemIndicesGroups =[];

        for(var i=0;i<tableAusBilanzen.length;i++){
            var currentColumn = tableAusBilanzen[i];
            var nextColumn    = tableAusBilanzen[i+1];
            if(i==0){
                var currentItemIndices = new itemIndices();
                //Assign the item indices
                for(var x=0;x<currentColumn.length;x++){
                    //If there is a double definition of one entry the array gets reset
                    var currentItem = currentColumn[x];
                    var nextItem;
                    if(nextColumn){
                        nextItem = nextColumn[x];
                    }

                
                    //Additional special case: find year when there is an empty start tag 
                    if(currentItem.indexOf('<b></b>')!=-1){
                        for(var n=0;n<tableAusBilanzen.length;n++){
                            if(!tableAusBilanzen[n])debugger;
                            var toCheck = tableAusBilanzen[n][i];
                            var toCheckText = utils.htmlText2Text(toCheck);
                            var numberMatch = regLib.matchNumber(toCheck);
                            if(numberMatch && numberMatch.length>=1){
                                if(currentItemIndices.jahr!=-1){
                                    itemIndicesGroups.push(currentItemIndices);
                                    currentItemIndices = new itemIndices();    
                                }  
                                currentItemIndices.jahr = x;
                                continue; //break inner loop 
                            }
                        }
                    }

                    var currentItemTextLC = utils.htmlText2Text(currentItem).trim().toLowerCase();

                    //Additional special case: recognize index passiva 
                    if(currentItemTextLC && currentItemTextLC.indexOf("aktiva")!=-1){
                        indexAktiva = x; 
                    }else if(currentItemTextLC && currentItemTextLC.indexOf("passiva")!=-1){
                        indexPassiva = x; 
                    }

                    //Skip empty items 
                    if(!currentItem||!currentItemTextLC)continue;
                    //Check the rest of the cases 
                    if((currentItemTextLC.indexOf("bilanzsumme")==-1 && nextItem && nextItem.indexOf("</b>")!=-1)){
                        if(currentItemIndices.jahr!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.jahr = x;
                    }else if(currentItemTextLC.indexOf("anlagevermögen")!=-1){
                        if(currentItemIndices.aktiva.anlagevermoegen!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.aktiva.anlagevermoegen = x;
                    }else if(currentItemTextLC.indexOf("goodwill")!=-1){
                        if(currentItemIndices.aktiva.goodwill!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.aktiva.goodwill = x;
                    }else if(currentItemTextLC.indexOf("sachanlage")!=-1){
                        if(currentItemIndices.aktiva.sachanlagen!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.aktiva.sachanlagen = x;
                    }else if(currentItemTextLC.indexOf("beteiligungen")!=-1){
                        if(currentItemIndices.aktiva.beteiligungen!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.aktiva.beteiligungen = x;
                    }else if(currentItemTextLC.indexOf("umlaufvermögen")!=-1){
                        if(currentItemIndices.aktiva.umlaufvermoegen!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.aktiva.umlaufvermoegen = x;
                    }else if(currentItemTextLC.indexOf("flüssige mittel")!=-1){
                        if(currentItemIndices.aktiva.wertpapiere_fluessigemittel!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.aktiva.wertpapiere_fluessigemittel = x;
                    }else if(currentItemTextLC.indexOf("vorräte")!=-1){
                        if(currentItemIndices.aktiva.vorraete!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.aktiva.vorraete = x;
                    }else if(currentItemTextLC.indexOf("rechnungsabgrenzung")!=-1){
                        var ident; //indicator, to which item the stuff belongs aktiva or passiva
                        if( utils.doesArrayContainString(currentColumn,"Aktiva")){
                            ident ="aktiva";
                        }else if(utils.doesArrayContainString(currentColumn,"Passiva")){
                            ident ="passiva";
                        }else{  
                            ident ="aktiva";
                        }
                      
                        if(currentItemIndices[ident].rechnungsabgrenzung!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices[ident].rechnungsabgrenzung = x;
                    }
            
                    else if(currentItemTextLC.indexOf("eigenkapital")!=-1){
                        if(currentItemIndices.passiva.eigenkapital!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.eigenkapital = x;
                    }else if(currentItemTextLC.indexOf("gezeichnetes kapital")!=-1){
                        if(currentItemIndices.passiva.eigenkapital_davon_gezeichnetes_kapital!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.eigenkapital_davon_gezeichnetes_kapital = x;
                    }else if(currentItemTextLC.indexOf("bilanzergebnis")!=-1){
                        if(currentItemIndices.passiva.eigenkapital_davon_bilanzergebniss!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.eigenkapital_davon_bilanzergebniss = x;
                    }else if(currentItemTextLC.indexOf("rückstellungen")!=-1 && currentItemTextLC.indexOf("pensions")==-1 ){
                        if(currentItemIndices.passiva.andere_rueckstellungen!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.andere_rueckstellungen = x;
                    }else if(currentItemTextLC.indexOf("verbindlichkeiten")!=-1){
                        if(currentItemIndices.passiva.verbindlichkeiten!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.verbindlichkeiten = x;
                    }else if(currentItemTextLC.indexOf("davon über")!=-1 && currentItemTextLC.indexOf("jahr")!=-1){
                        if(currentItemIndices.passiva.verbindlichkeiten_davon_ueber_1jahr!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.verbindlichkeiten_davon_ueber_1jahr = x;
                    }else if(currentItemTextLC.indexOf("bilanzsumme")!=-1){
                        if(currentItemIndices.passiva.bilanzsumme!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.bilanzsumme = x;
                    }else if(currentItemTextLC.indexOf("andere rückstellungen")!=-1){
                        if(currentItemIndices.passiva.andere_rueckstellungen!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.andere_rueckstellungen = x;
                    }else if(currentItemTextLC.indexOf("sopo m. rücklage")!=-1){
                        if(currentItemIndices.passiva.sopo_mit_ruecklageant!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.sopo_mit_ruecklageant = x;
                    }else if(currentItemTextLC.indexOf("investitionszusch")!=-1){
                        if(currentItemIndices.passiva.investitionszueschuesse!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.investitionszueschuesse = x;
                    }else if(currentItemTextLC.indexOf("fremdkapital")!=-1){
                        if(currentItemIndices.passiva.fremdkapital!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.fremdkapital = x;
                    }else if(currentItemTextLC.indexOf("pensionsrückstellungen")!=-1){
                        if(currentItemIndices.passiva.pensionsrueckstellungen!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.pensionsrueckstellungen = x;
                    }else if(currentItemTextLC.indexOf("and. rückstellungen")!=-1){
                        if(currentItemIndices.passiva.andere_rueckstellungen!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.andere_rueckstellungen = x;
                    }else if(currentItemTextLC.indexOf("langfr")!=-1 && currentItemTextLC.indexOf("verbindl")!=-1){
                        if(currentItemIndices.passiva.fremdkapital_langfr_verbindlichk!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.fremdkapital_langfr_verbindlichk = x;
                    }else if(currentItemTextLC.indexOf("kurz")!=-1 && currentItemTextLC.indexOf("verbindl")!=-1){
                        if(currentItemIndices.passiva.fremdkapital_kurzfrmfr_verbindlichk!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.fremdkapital_kurzfrmfr_verbindlichk = x;
                    }else{
                        if(indexAktiva!=-1 && indexPassiva ==-1){
                            currentItemIndices.aktiva[currentItemTextLC] = x; 
                        }else if(indexAktiva!=-1 && indexPassiva!=-1){
                            currentItemIndices.passiva[currentItemTextLC] = x; 
                        }else{
                           currentItemIndices[currentItemTextLC] = x;
                        }
                    }
 
                }
                
                itemIndicesGroups.push(currentItemIndices);
            }else{ 
                //The values get assigned to the indices here 
                var filledItem = parseColumnContentToItem(currentColumn,itemIndicesGroups);
                if(columnIdentifiers.length>0 &&columnIdentifiers[i-1]){
                    filledItem["columnId"] = columnIdentifiers[i-1];
                }
                //Push the values to returnobject 
                returnObject = pushItemToReturnObject("ausBilanzen",filledItem,returnObject,i);
            }  
        }
    }


    returnObject.ausBilanzen = utils.removeEmptyEntriesFromArray(returnObject.ausBilanzen);
    returnObject.notizen = utils.removeEmptyEntriesFromArray(returnObject.notizen);

    return returnObject;
}

function parse_aus_gewinn_und_verlustrechnungen(tablesParsed,tablesArr,rest,infos){

    //Row indices of which assign values to  variables, 
    //these are assigned by parsing the first column in the array 
    function itemIndices(){
        this.jahr=-1;
        this.bestandsveraenderung=-1;
        this.akteigenleistung=-1;
        this.sonstbetrerträge=-1;
        this.materialaufwand=-1;
        this.personalaufwand=-1;
        this.abschreibungen=-1;
        this.sonstbetraufwand=-1;
        this.finanzergebnis =-1;
        this.ergebnis_d_gewoehnlichen_geschaeftstaetigkeit=-1;
        this.aoergebnis=-1;
        this.steuern=-1;
        this.eesteuern=-1;
        this.jahresergebnis;
        this.notizen= []
    };
    var indexAktiva=-1;
    var indexPassiva=-1;

    var columnIdentifiers = []; //Contains identifiers for columns, if there are additional ones, than 'jahr'

    var returnObject = {
        ausGewinnUndVerlustRechnung: [],
        notizen: []
    }; 

        //Find the additional information in Headerline 
    for(key in rest){
        if(rest.hasOwnProperty(key)){
            var currentRest = utils.htmlText2Text(rest[key]);
            if(currentRest && currentRest.indexOf("Aus den Bilanzen")!=-1){
                var headline = utils.htmlText2Text(rest[0]).replace("Aus den Bilanzen","");
                var matchPar = regLib.matchBetweenParenthesis(headline);
                debugger;
                if(matchPar[0]){
                    debugger;
                    returnObject.notizen.push(matchPar[0]);
                }               
            }else{
                returnObject.notizen.push(currentRest);
            }
        }
    }

    var startIncr=0; 
    if(tablesParsed.length==2){ //This means there is an additional table 
        startIncr=1;
        var numberOfColumns = tablesParsed[1].length-1; //Columns with content number 
        var numberOfIdentifiers = tablesParsed[0].length-1;
        var identifierSpan = numberOfColumns / numberOfIdentifiers;
        for(var i=1;i<tablesParsed[0].length;i++){
            var currentIdentifier = utils.htmlText2Text(tablesParsed[0][i][0]).trim();
            for(var x=0;x<identifierSpan;x++){
                columnIdentifiers.push(currentIdentifier);
            }
        }
    }

    for(var s=0+startIncr;s<tablesParsed.length;s++){
        var tableAusGUV  = tablesParsed[s];
        var itemIndicesGroups =[];

        for(var i=0;i<tableAusGUV.length;i++){
            var currentColumn = tableAusGUV[i];
            var nextColumn    = tableAusGUV[i+1];
            if(i==0){
                var currentItemIndices = new itemIndices();
                //Assign the item indices
                for(var x=0;x<currentColumn.length;x++){
                    //If there is a double definition of one entry the array gets reset
                    var currentItem = currentColumn[x];
                    var nextItem;
                    if(nextColumn){
                        nextItem = nextColumn[x];
                    }

                
                    //Additional special case: find year when there is an empty start tag 
                    if(currentItem.indexOf('<b></b>')!=-1){
                        for(var n=0;n<tableAusGUV.length;n++){
                            if(!tableAusGUV[n])debugger;
                            var toCheck = tableAusGUV[n][i];
                            var toCheckText = utils.htmlText2Text(toCheck);
                            var numberMatch = regLib.matchNumber(toCheck);
                            if(numberMatch && numberMatch.length>=1){
                                if(currentItemIndices.jahr!=-1){
                                    itemIndicesGroups.push(currentItemIndices);
                                    currentItemIndices = new itemIndices();    
                                }  
                                currentItemIndices.jahr = x;
                                continue; //break inner loop 
                            }
                        }
                    }

                    var currentItemTextLC = utils.htmlText2Text(currentItem).trim().toLowerCase();

                    //Additional special case: recognize index passiva 
                    if(currentItemTextLC && currentItemTextLC.indexOf("aktiva")!=-1){
                        indexAktiva = x; 
                    }else if(currentItemTextLC && currentItemTextLC.indexOf("passiva")!=-1){
                        indexPassiva = x; 
                    }

                    //Skip empty items 
                    if(!currentItem||!currentItemTextLC)continue;
                    //Check the rest of the cases 
                    if((currentItemTextLC.indexOf("bilanzsumme")==-1 && nextItem && nextItem.indexOf("</b>")!=-1)){
                        if(currentItemIndices.jahr!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.jahr = x;
                    }else if(currentItemTextLC.indexOf("umsatz")!=-1){
                        if(currentItemIndices.umsatz!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.umsatz = x;
                    }else if(currentItemTextLC.indexOf("bestandsveränderung")!=-1){
                        if(currentItemIndices.bestandsveraenderung!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.bestandsveraenderung = x;
                    }else if(currentItemTextLC.indexOf("akt")!=-1 && currentItemTextLC.indexOf("eigenleistung")!=-1){
                        if(currentItemIndices.akteigenleistung!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.akteigenleistung = x;
                    }else if(currentItemTextLC.indexOf("sonst")!=-1 && currentItemTextLC.indexOf("betr")!=-1 && currentItemTextLC.indexOf("erträge")!=-1){
                        if(currentItemIndices.sonstbetrerträge!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.sonstbetrerträge = x;
                    }else if(currentItemTextLC.indexOf("materialaufwand")!=-1){
                        if(currentItemIndices.materialaufwand!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.materialaufwand = x;
                    }else if(currentItemTextLC.indexOf("personalaufwand")!=-1){
                        if(currentItemIndices.personalaufwand!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.personalaufwand = x;
                    }else if(currentItemTextLC.indexOf("abschreibungen")!=-1){
                        if(currentItemIndices.abschreibungen!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.abschreibungen = x;
                    }else if(currentItemTextLC.indexOf("sonst")!=-1 && currentItemTextLC.indexOf("betr")!=-1 && currentItemTextLC.indexOf("aufwand")!=-1){
                        if(currentItemIndices.sonstbetraufwand!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.sonstbetraufwand = x;
                    }else if(currentItemTextLC.indexOf("finanzergebnis")!=-1){
                        if(currentItemIndices.finanzergebnis!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.finanzergebnis = x;
                    }else if(currentItemTextLC.indexOf("ergebnis")!=-1 && currentItemTextLC.indexOf("geschäftstätigkeit")!=-1){
                        if(currentItemIndices.ergebnis_d_gewoehnlichen_geschaeftstaetigkeit!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.ergebnis_d_gewoehnlichen_geschaeftstaetigkeit = x;
                    }else if(currentItemTextLC.indexOf("ao ergebnis")!=-1){
                        if(currentItemIndices.aoergebnis!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.aoergebnis = x;
                    }else if(currentItemTextLC.indexOf("steuern")!=-1 
                        && currentItemTextLC.indexOf("ee")==-1){
                        
                        if(currentItemIndices.steuern!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.steuern = x;
                    }else if(currentItemTextLC.indexOf("ee-steuern")!=-1){
                        if(currentItemIndices.eesteuern!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.eesteuern = x;
                    }else if(currentItemTextLC.indexOf("jahresergebnis")!=-1){
                        if(currentItemIndices.jahresergebnis!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.jahresergebnis = x;
                    }else{                    
                        currentItemIndices[currentItemTextLC] = x; 
                    }
 
                }
                
                itemIndicesGroups.push(currentItemIndices);
            }else{ 
                //The values get assigned to the indices here 
                var filledItem = parseColumnContentToItem(currentColumn,itemIndicesGroups);
                if(columnIdentifiers.length>0 &&columnIdentifiers[i-1]){
                    filledItem["columnId"] = columnIdentifiers[i-1];
                }
                //Push the values to returnobject 
                returnObject = pushItemToReturnObject("ausGewinnUndVerlustRechnung",filledItem,returnObject,i);
            }  
        }
    }


    returnObject.ausGewinnUndVerlustRechnung = utils.removeEmptyEntriesFromArray(returnObject.ausGewinnUndVerlustRechnung);
    returnObject.notizen = utils.removeEmptyEntriesFromArray(returnObject.notizen);

    return returnObject;
}


function recognizeTableContent(tablesParsed,content){
    var returnObject = {};
    for(var i=0;i<tablesParsed.length;i++){
        var tableToCheck = tablesParsed[i];
        if(!tableToCheck[0]) continue;
        var firstItem = utils.htmlText2Text(tableToCheck[0][0].toLowerCase()).trim();
        if(content ==="kapitalentwicklung"){
            returnObject = recognizeKurseContent(returnObject,firstItem,i);
        }
    }
    return returnObject;
}
function recognizeKurseContent(returnObject,item,i){
    if(item.indexOf("grundkapital")!=-1){
        returnObject.grundkapitalIndex = i;
        return returnObject;
    }      
    var numMatch = regLib.matchYear(item);
    if(numMatch && numMatch.length >=1){
        returnObject.kapitalEntwicklungIndex = i;
        return returnObject;
    }
    if(item.indexOf("genehmigtes")!=-1){
        returnObject.genehmKapitalIndex = i;
        return returnObject;
    }
    if(item.indexOf("bedingtes")!=-1){
        returnObject.bedingKapitalIndex = i;
        return returnObject;
    }
    if(item.indexOf("bezugsrechte")!=-1){
        returnObject.besBezugsrechteIndex = i;
        return returnObject;
    }
    if(item.indexOf("ermächtigung")!=-1){
        returnObject.ermaechtigungAktienErwerbIndex = i;
        return returnObject;
    }
    return returnObject;
}

/**
 * Push an item to the specified returnObject (attach content to identifier property) and return the modified Object ,
 * when the item in the above row in the table specified by the identifier has a year, the year gets copied to the current
 * table.
 * @param {string} identifier property identifier where the item should be attached, should lead to an array in returnObject 
 * @param {object} itemToPush this content gets pushed to the returnobject
 * @param {object} returnObject modified object with itemToPush attached 
 * @param {int} rowIndex index of the current row at array identified by array 
 * @returns returnobject {object} modified object
 */
function pushItemToReturnObject(identifier,itemToPush,returnObject,rowIndex){
    if(!returnObject[identifier]){
        returnObject[identifier] = []; //Create new array at identifier if it doesnt exist 
    }
    if(!utils.isObjectEmpty(itemToPush)){ //also push empty objects ... because of indexing ... clear later
        if(!itemToPush.jahr){
            //Special case, the year was defined in the table above this item
            //content get's assigned to the content from the above item
            
            if(returnObject[identifier][rowIndex-1]){
                for(key in itemToPush){   
                    if (itemToPush.hasOwnProperty(key)) {     
                        if(itemToPush[key]){
                            returnObject[identifier][rowIndex-1][key] = itemToPush[key];
                        }
                    }
                }
            }else{
                //debugger; //TODO check this in ausBilanzen
            }
        }else{
            //Standard case, there is a year in the item recognized 
            returnObject[identifier].push(itemToPush);
        }
    }else{
        //Just push empty object, because of indexing .... will be terminated later again
        returnObject[identifier].push(itemToPush);
    }
    return returnObject;
}

/**
 * Writes content of a single table column to the correct categories in in an object which gets
 * returned then 
 * @param {array} currentColumn table column contents of one column as an arra as an array 
 * @param {array} itemIndicesGroups indices as an array which map the column index to a category in recognzied content 
 */
function parseColumnContentToItem(currentColumn,itemIndicesGroups){
    var itemToFill = {};

    for(var x=0;x<currentColumn.length;x++){
        var currentItem = currentColumn[x];
        var currentItemTextLC = utils.htmlText2Text(currentItem).trim().toLowerCase();
        if(!currentItemTextLC) continue;
            //if(currentItemTextLC=="6 884")debugger;   
            for(var n=0;n<itemIndicesGroups.length;n++){ //For all groups in this table
                itemToFill = assignIndicesToObject(itemToFill,x,itemIndicesGroups[n],currentItemTextLC);
            }
    }
    return itemToFill;
}
/**
 * Assigns a defined value to the item, if the index matches an index in the array
 * @param {object} item content which might be changed 
 * @param {integer} index the current index to check on in the indices array 
 * @param {array} indicesArray contains information, which key is at which position
 * @param {string} value value which gets assigned to indices array
 * @param {string} (optional) additionalKey is used for sublevel assignments, in recursive calls of this
 * 
 * @return item with additional key and value pairs from indices array if there was a match 
 */
function assignIndicesToObject(item,index,indicesArray,value,additionalKey){
    
    
    //if(value=="6 884")debugger;    
    
    for(key in indicesArray){   
        if (indicesArray.hasOwnProperty(key)) {


            var arrayval = indicesArray[key];
 
            if(typeof arrayval ==="object"){
                //Arrayval is not a number so it must be subitem 
                item = assignIndicesToObject(item,index,arrayval,value,key);

            }else if (typeof arrayval ==="number"){
                //Arrayval is number, so just assign key
                if(index==arrayval){
                    if(additionalKey){
                        if(!item[additionalKey]) item[additionalKey] = {};
                        if(arrayval>=0){
                            item[additionalKey][key] = value;
                        }else{
                            debugger;
                        }
                    }else{
                        if(arrayval>=0){
                            item[key]= value;
                        }else{
                            debugger;
                        }
                    }

                }
            }//else{
                //it's usually a function, which means- do nothing
            //}
            
    
        }
    }

    return item;
}



function getStückelung(line){
    var stückelung=null;
    if(/Stückelung/i.test(line)){
        var clsplit = line.split(':');
        if(clsplit[1]){
            stückelung = clsplit[1];
        }
    }
    return stückelung;
}

function getStimmrecht(line){
    var stimmrecht=null;
    if(/Stimmrecht/i.test(line)){
        var clsplit = line.split(':');
        if(clsplit[1]){
            stimmrecht = clsplit[1];
        }
    }
    return stimmrecht;
}

 

/**
 * Get the following restlines respecting the infos object, checks in the infos object
 * For the related table, if there is a rest following the stopindex of the table
 * Returns the rest as array of lines seperated by the given seperator 
 * @param {object} relatedInfo information object of the current table with start and stop indices 
 * @param {object} rest object with indices of rest lines as keys and the lines themselves as values
 * @param {string} seperator seperator string which is used to split the rest in parts
 * @returns array of lines from rest which has been found, or null if nothing found
 */
function getRestLines(relatedInfo,rest,seperator,nextInfo){
        var stopIndex = relatedInfo.indexStop;
        var restEndIndex;
        if(nextInfo){
            restEndIndex = nextInfo.indexStart; //if there is a follow-up table 
        }else{
            restEndIndex = null;
        }

        var restStartIndex = stopIndex+1; 
        var restBlob="";
         
        for (var key in rest) {
            if (rest.hasOwnProperty(key)) {
                //console.log(key + " -> " + rest[key]);
                var keynum =  parseInt(key) ; //cast key as number 
                if(isNaN(keynum)) continue;
                if(restEndIndex){ //if rest is limited 
                    if( keynum >= restStartIndex && keynum < restEndIndex){
                        restBlob = restBlob + seperator +  rest[key]
                    }
                    /* JS: No good idea, json object order is not guaranteed
                    if(keynum >= restEndIndex){
                        break; //End loop if rest is limited
                    }
                    */
                }else{
                    if(keynum >= restStartIndex){
                        //Just add everything
                        restBlob = restBlob + seperator+ rest[key];
                    }
                }
            }
        }

        //Split array with seperator and return
        if(restBlob){
            var restBsplit = restBlob.split(seperator);
            return restBsplit;
        }else{
            return null;
        }

}

function getNextIndex(tablesIndices,currentIndex){    
    for(var key in tablesIndices){
        if(tablesIndices.hasOwnProperty(key)){
            var index = tablesIndices[key];
            if(index>currentIndex) return index; //Return first key found 
        }
    }
}

module.exports = {
    recognizeTableArrays, 
    createParsedTables,
    parse_kapitalEntwicklung,
    parse_genehmKapital,
    parse_grundkapital,
    parse_bereinigtekurse,
    parse_dividenden,
    parse_kennzahlen,
    parse_bedingKapital,
    parse_besBezugsrechte,
    parse_ermAktienerwerb,
    parse_aus_bilanzen,
    parse_aus_gewinn_und_verlustrechnungen,
    recognizeTableContent, 
    getNextIndex
}