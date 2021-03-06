/**
 * dictionaryHandler.js 
 * 
 * Loads in dictionary files. These are usually extracted-tables from the 'Aktienfuehrer1'-Sqlite database.
 * The extracted table format is json. The get loaded and this module provides methods, to check if arbitrary
 * strings are located in the dict format.
 * 
 * TODO/IDEAS: 
 * For the used levenstein distance there is an alternative, the 'soerensen-dice-coefficent' 
 * this might be more effective.
 */

var fs = require('fs');
var levenshtein = require('fast-levenshtein');
var regLib = require('./regexLib');

const path_to_titles = "./dictfiles/dict_titles.json";
const path_to_functions = "./dictfiles/dict_functs.json";

const ldist_treshhold = 10;     //Minimum distance for a value to get recognized with ldist matching 
var dict_titles_loaded=false;   //Indicates if the dictionary was loaded successfully 
var dict_titles;                //The dictionary with titles is loaded in this variable in JSON notation 

var titleWithoutBracketsRegex = new RegExp(/(\((.*?)\))/g); //Regular expression for matching title without parenthesis
var exceptionsInBracketsRegex = new RegExp(/\((FH)\)/);  //This is a special filter for sometimes the content is part of title not of funct

/** 
 * Returns a value which indicates if dictionary has been successfully loaded
 * @returns {boolean} true dict has been loaded, false dict has not been loaded 
 */
function isDictTitlesLoaded(){
    return dict_titles_loaded;  
}

/** 
 * Returns a value which indicates if dictionary has been successfully loaded
 * @returns {boolean} true dict has been loaded, false dict has not been loaded 
 */
function isDictFunctsLoaded(){
    return dict_functs_loaded;  
}




/**
 * Checks in an array of strings of each element contains a title, if it does it gets added 
 * to an accumulated title string. In this string the entries are seperated by a ','. Detects 
 * also if there could be a name  
 * @param data {array} array of strings which could contain a title 
 * @returns {object} data described at function start called 'returnObject' 
 */
function checkIfTitleIsInArray(data,seperator=',',matching='normal'){    
    var returnObject = {
        titleDetected:"",  //The accumulated detected title, if there is one 
        hasTitle: false,   //Indicator if there is a accumulated title 
        nameDetected:"",   //Contains a namestring if there is one detected 
        hasName: false,    //Indicates if there is a namestring detected 
        nextIndex: 0      //Next index in data array after last recognized object 
    }

    var titleAccu="";             //Accumulated title which is generated 
    var dataWithoutTitleAccu="";  //Accumulated data without title
    var nameAccu="";              //Accumulated data for name
    
    
    /*
    if(data[1] && data[1].indexOf("Hubertus")!=-1){
        debugger;
    }
    */

    for (var i=0;i<data.length;i++) {

        //replace everything within brackets, except FH because it's part of the title, because stuff in brackets is a funct
        var dataMatch = data[i].match(titleWithoutBracketsRegex); 
        var element=""; 
        if(dataMatch!=null){
            var foundExpression =""; 
            for(var x=0;x<dataMatch.length;x++){
                var excMatch = dataMatch[x].match(exceptionsInBracketsRegex);
                if(excMatch==null){
                    foundExpression = dataMatch[x];
                }
            }
            element =data[i].replace(foundExpression,''); 
        }else{
            element =data[i];
        }
        var options={};
        options.matching = matching; 
        var titleInfo = checkIfaDictContentIsInString(element,dict_titles,dict_titles_loaded,options);
       
        if(titleInfo.isTitle){
            //Only try to recognize title if there is no letter following up the recognized title
            //This prevents false positives with 'citys' like 'Dreikirchen' with 'Dr' in it
            var startwithLetter =null;
            if(titleInfo.dataWithoutTitle){
                startwithLetter= titleInfo.dataWithoutTitle.match(/^[A-Za-z]/);
            }
            //title 
            //title blabla 
            titleAccu =  titleAccu +seperator+titleInfo.titleFound;
            dataWithoutTitleAccu = dataWithoutTitleAccu +seperator+ data[i].replace(titleInfo.titleFound.trim(),"");
            if(titleInfo.hasRest){
                nameAccu = nameAccu +seperator+ titleInfo.dataWithoutTitle;
            }
            returnObject.nextIndex=i+1;         //Increment index (What's the next index without title?)
        }else{
            dataWithoutTitleAccu = dataWithoutTitleAccu +seperator+ data[i];
            if(titleInfo.hasRest){
                nameAccu = nameAccu +seperator+ titleInfo.dataWithoutTitle;
            }
        }
    }

    if(nameAccu){
        returnObject.hasName = true; 
        returnObject.nameDetected = nameAccu.trim();
    }
    
    returnObject.hasTitle = regLib.removeLeadingCharacter(titleAccu.trim(),seperator).length>0?true:false; //if there is an accumulated title add title
    returnObject.titleDetected = regLib.removeLeadingCharacter(titleAccu.trim(),seperator); 
    returnObject.dataWithoutTitle = regLib.removeLeadingCharacter(dataWithoutTitleAccu.trim(), seperator);
    if(returnObject.hasName){
        returnObject.nameDetected = regLib.removeLeadingCharacter(dataWithoutTitleAccu.trim(), seperator); //Ok ?? //Just a quick fix 
    }
    return returnObject; 
}

/**
 * Public function for checkIfaDictContentIsInString
 * with parameters for Funct 
 */
function checkIfaFunctContentIsInString(data){
    return checkIfaDictContentIsInString(data,dict_functs,dict_functs_loaded);
}

/**
 * TODO: The title return values are misleading, because the function is not used only for title
 * Check if one entry in the given dictionary is within the string given as a parameter
 * @param {string} data to check if it's a title 
 * @param {object} dict which is checked against  
 * @param {boolean} dict_loaded was the specified dictionary loaded
 * @param {object} options for matching
 *        matching:"normal"       -> exact matching with indexOf function
 *        matching:"ldist"        -> matching with a levenstein distance indicator-> adds additional info to the return object 
 * @returns {object} true if the data is in the dictionary, false if not; rest of data as a string, boolean indicator if there is a rest; data found
 */
function checkIfaDictContentIsInString(data,dict,dict_loaded,options = {matching:"normal"}){
    //Check for multiple entries here 

    if(!dict_loaded) return null; //No dictionary to match against 
    var returnObject = {
        isTitle:false,
        dataWithoutTitle:"",
        hasRest:false, 
        titleFound:"",
        dataInBrackets:""
    }
    var ldistMatches = []; 
    var titleAccu =""; //Variable holder which can contain a set of multiple titles
    var dataWithoutTitle=data;  //Starting value for data which has no title
    /*
    if(data.indexOf("Fürsten")!=-1){
        debugger;
    }
    */
    for(var i=0;i<dict["rows"].length;i++){
        var rowElement = dict["rows"][i];
        var entry = rowElement[0];  
        if(entry.indexOf(""))
        if(rowElement.length>1) console.warn("Row element shouldn't have multiple entries at ",i);
        
        /*
        if(entry.indexOf("Fürsten")!=-1){
            debugger;
        }*/
    
        //Check if data is somewhere in the entry, it's str.indexOf(substr)
        //if(entry.indexOf(data)>-1)return true; *OBSOLETE*  
        
        if(options.matching==="normal"){
            var bracketsMatchFiltered = dataWithoutTitle.replace(exceptionsInBracketsRegex,''); //Filter entries which could be parenthesis in title like 'Dipl. Ing. (FH)'
            //if(entry.indexOf(""))
            var indexFound = bracketsMatchFiltered.indexOf(entry);  
            if(indexFound>-1){

                var maybeDataWithoutTitle = dataWithoutTitle.replace(entry,"¦").replace(/\(\)/g,'');; //TODO: JS-> this will probably produce strange results, check this against mass-data
                var followed = regLib.checkIfCharIsFollowedByLetters(maybeDataWithoutTitle,"¦");
                if(!followed || followed.length==0){
                    titleAccu =titleAccu+" "+entry; 
                    dataWithoutTitle = maybeDataWithoutTitle.replace("¦","");
                } 
                //Check if the found title is within brackets 

                /** This doesn't work when there is 3 brackets (something) (title) (something) ...something doesn't dcontain exception, something is take as title 
                var bracketsMatchFiltered = data.replace(exceptionsInBracketsRegex,'');
                var bracketsMatch = bracketsMatchFiltered.match(titleWithoutBracketsRegex); //Filter out a set of entries which could be a combined title: like "Dipl. Ing. (FH)"
                if(bracketsMatch && bracketsMatch!=null){
                    returnObject.titleFound = bracketsMatch.length>=1?bracketsMatch[0].replace(/\(|\)/g,''):"" ;
                    returnObject.dataWithoutTitle = data.replace(returnObject.titleFound,"").replace(/\(|\)/g,'');
                }
                */
                //return returnObject;   
            }          
        }else if(options.matching =="ldist"){
            //Calculate levenshtein distance: 
            data = data.trim();
            var distance = levenshtein.get(entry, data.substring(0,entry.length));   
            
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

    //Finalization steps 
    if(options.matching==="normal"){
        if(titleAccu && titleAccu.length>0){
            returnObject.isTitle = true; 
            returnObject.dataWithoutTitle = dataWithoutTitle.trim(); 
            returnObject.hasRest = dataWithoutTitle.trim().length>0?true:false; 
            returnObject.titleFound = titleAccu;
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
            sortDict(dict_titles_loaded,dict_titles);
        }else{
            console.log("Successfully loaded titles dictionary, but no rows detected "); 
        }
    }
}

/**
 * Create a local json object for the functions by loading the specified file from path_to_functions-path 
 * in the constants 
 */
function createFunctionsDict(){
    dict_functs_loaded=false; 
    console.log("createFunctionsDict "); 
    var functs_json = readJSONFile(path_to_functions); 
    if(functs_json!=null){
        dict_functs_loaded=true; 
        dict_functs = functs_json; //Assign to module-scope
        if(functs_json["rows"]){
            console.log("Successfully loaded functions dictionary, with length ",functs_json["rows"].length); 
            sortDict(dict_functs_loaded,dict_functs);
        }else{
            console.log("Successfully loaded functions dictionary, but no rows detected "); 
        }
    }
}
/**
 * Sort the entries in the titles dictionary after length. 
 * Longest titles will be first in order.
 * @param {boolean} isLoaded the dictionary has been loaded 
 * @param {object} dictionary the dictionary which will get sorted 
 */
function sortDict(isLoaded,dictionary){    
    if(!isLoaded){
        console.log("Won't sort entries in titles dictionary, cause it was not loaded"); 
        return; 
    }
    console.log("sorting the dictionary after length of the entry, longest entries will be at start of array");
    dictionary.rows.sort(function(a, b){
        // ASC  -> a.length - b.length
        // DESC -> b.length - a.length
        return b[0].length - a[0].length;
    });
}

/**
 * Reads an arbitrary JSON-file from the specified path 
 * @param {string} filepath path of the json-file specified 
 * @returns json-object created or null 
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
    createFunctionsDict,
    isDictTitlesLoaded,
    isDictFunctsLoaded,
    checkIfaDictContentIsInString,
    checkIfaFunctContentIsInString,
    checkIfTitleIsInArray
}
