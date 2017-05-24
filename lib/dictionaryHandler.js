var fs = require('fs');
var levenshtein = require('fast-levenshtein');

const path_to_titles = "./dictfiles/dict_titles.json";
const ldist_treshhold = 10;     //Minimum distance for a value to get recognized with ldist matching 
var dict_titles_loaded=false;   //Indicates if the dictionary was loaded successfully 
var dict_titles;                //The dictionary with titles is loaded in this variable in JSON notation 



/** 
 * Returns a value which indicates if dictionary has been successfully loaded
 * @returns {boolean} true dict has been loaded, false dict has not been loaded 
 */
function isDictTitlesLoaded(){
    return dict_titles_loaded;  
}



/**
 * Checks in an array of strings of each element contains a title, if it does it gets added 
 * to an accumulated title string. In this string the entries are seperated by a ','. Detects 
 * also if there could be a name  
 * @param data {array} array of strings which could contain a title 
 * @returns {object} data described at function start called 'returnObject' 
 */
function checkIfTitleIsInArray(data,seperator=',',matching='normal'){    
    var returnObject ={
        titleDetected:"",  //The accumulated detected title, if there is one 
        hasTitle: false,   //Indicator if there is a accumulated title 
        nameDetected:"",   //Contains a namestring if there is one detected 
        hasName: false,    //Indicates if there is a namestring detected 
        nextIndex: -1      //Next index in data array after last recognized object 
    }

    var titleAccu=""; //Accumulated title which is generated 

    for (var i=0;i<data.length;i++) {

        var element = data[i];
        var options={};
        options.matching = matching; 
        var titleInfo = checkIfaTitleIsInString(element,options);
        if(titleInfo.isTitle){
            //Accumulate title and continue with next entry 
            if(titleAccu!==""){
                titleAccu=titleAccu+seperator+titleInfo.titleFound; 
            }else{
                titleAccu =titleInfo.titleFound; 
            }
            
            if(titleInfo.hasRest){ //to the detected title in addition a rest is detected, this means there is also a name and maybe a funct 
                returnObject.hasName = true; 
                returnObject.nameDetected = titleInfo.dataWithoutTitle.substring(0,titleInfo.dataWithoutTitle.length);  
                returnObject.nextIndex=i+1; 
                break; 
            }
        }
    }      
    returnObject.hasTitle = titleAccu.length>0?true:false; //if there is an accumulated title add title
    returnObject.titleDetected = titleAccu; 
    return returnObject; 
}


/**
 * Check if one entry in the titles dictionary is within the string given as a parameter
 * @param {string} data to check if it's a title 
 * @param {object} options for matching, currently unused 
 *        matching:"normal"       -> exact matching with indexOf function
 *        matching:"ldist"        -> matching with a levenstein distance indicator-> adds additional info to the return object 
 * @returns {object} true if it's a title, false if not; rest of data as a string, boolean indicator if there is a rest; title found
 */
function checkIfaTitleIsInString(data,options = {matching:"normal"}){

    if(!dict_titles_loaded) return null; //No dictionary to match against 
    var returnObject = {
        isTitle:false,
        dataWithoutTitle:"",
        hasRest:false, 
        titleFound:"",
    }
    var ldistMatches = []; 

    for(var i=0;i<dict_titles["rows"].length;i++){
        var rowElement = dict_titles["rows"][i];
        var entry = rowElement[0];  
        if(rowElement.length>1) console.warn("Row element shouldn't have multiple entries at ",i);

        //Check if data is somewhere in the entry, it's str.indexOf(substr)
        //if(entry.indexOf(data)>-1)return true; *OBSOLETE*  

        if(options.matching==="normal"){
            var indexFound = data.indexOf(entry); //JS: This matching produces false entries, it should be upgraded with a nearest distance check, case matching is also a topic 
            if(indexFound>-1){
                var dataWithoutTitle;  
                if(indexFound==0){
                    dataWithoutTitle = data.substring(entry.length,data.length); 
                }else{
                    dataWithoutTitle = data.replace(entry,""); //TODO: JS-> this will probably produce strange results, check this against mass-data
                }
                
                returnObject.isTitle = true; 
                returnObject.dataWithoutTitle = dataWithoutTitle.trim(); 
                returnObject.hasRest = dataWithoutTitle.trim().length>0?true:false; 
                returnObject.titleFound = entry; 

                return returnObject; 
            }
        }else if(options.matching =="ldist"){
            //Calculate levenshtein distance: 
            data = data.trim();
            var distance = levenshtein.get(entry, data.substring(0,entry.length));   
            //distance = levenshtein.get("dddd.dddd.","55555");  //distance: 10 
            //distance = levenshtein.get("55555","dddd.dddd.");  //distance: 10 
            //var eintrag3 = "Wörterbuchtitel"; 
            //var eintrag4 = "TitelimEintrag"; 
            //var eintrag1 = "Dr. Prof. Jan Kamlah";
            //var eintrag2 = "Dr. Prof."; 
            //distance = levenshtein.get(eintrag2,eintrag1.substring(0,eintrag2.length)); 

            //entry: TITEL ____ NAME
            //data:  TITAL
            /*
            if(i==1226){
                debugger; 
            }
            */

            var maxlength = Math.max(entry.length,data.length); 
            var entrylengthweigth = 20 / entry.length;
            var normDistance = (distance/maxlength * 100)+entrylengthweigth; 
            if(normDistance<=ldist_treshhold){
                //console.log("LDist: from: ",entry,"; to data: ",data,"; is ", normDistance, " entry.length ", entry.length, " entry is title: ",new String(normDistance<ldist_treshhold?true:false));
                returnObject.isTitle = true; 
                var ldistMatch = {
                    dictionaryMatch:  entry,
                    normDistance:     normDistance
                }
                ldistMatches.push(ldistMatch);
            }

        }       
    }

    if(options.matching==="ldist"){
        if(ldistMatches.length>=1){
            //Sort the array of levenshtein distance matches to 
            ldistMatches.sort(function(a,b){
                //Ascending sorted after distance 
                return a.normDistance - b.normDistance;
            });

            returnObject.isTitle = true; 
            returnObject.titleFound = data.substring(0,ldistMatches[0].dictionaryMatch.length);
            returnObject.dataWithoutTitle = data.substring(ldistMatches[0].dictionaryMatch.length).trim();
            returnObject.hasRest = returnObject.dataWithoutTitle.length>=1?true:false;
        }
    }

    return returnObject; 
}

/**
 * Create a local json object for the titles by loading the specified file from path_to_titles-path 
 * in the constants 
 */
function createTitlesDict(){
    dict_titles_loaded=false; 
    console.log("createTitlesDict "); 
    var titles_json = readJSONFile(path_to_titles); 
    if(titles_json!=null){
        dict_titles_loaded=true; 
        dict_titles = titles_json; //Assign to module-scope
        if(titles_json["rows"]){
            console.log("Successfully loaded titles dictionary, with length ",titles_json["rows"].length); 
            sortTitlesDict();

        }else{
            console.log("Successfully loaded titles dictionary, but no rows detected "); 
        }
    }
}

/**
 * Sort the entries in the titles dictionary after length. 
 * Longest titles will be first in order.
 */
function sortTitlesDict(){    
    console.log("sortTitlesDict");

    if(!dict_titles_loaded){
        console.log("Won't sort entries in titles dictionary, cause it was not loaded"); 
        return; 
    }
    console.log("sorting the titles array after length of the title, longest titles will be at start of array");
    dict_titles.rows.sort(function(a, b){
        // ASC  -> a.length - b.length
        // DESC -> b.length - a.length
        return b[0].length - a[0].length;
    });
}

/**
 * Reads an arbitrary JSON-file from the specified path 
 * @param {string} filepath path of the json-file specified 
 * @returns json-object created or null 
 * 
 */
function readJSONFile(filepath){
    console.log("Reading file at filepath: ",filepath); 

    try{
        var fileread = fs.readFileSync(filepath, "utf8"); 
        var file = JSON.parse(fileread);
        return file; 
    }catch(ex){
        console.error("Problem reading JSON file ",ex);
        return null; 
    }
}


module.exports = {
    readJSONFile,
    createTitlesDict,
    isDictTitlesLoaded,
    checkIfaTitleIsInString,
    checkIfTitleIsInArray
}
