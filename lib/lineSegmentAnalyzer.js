var regLib       = require('./regexLib');

/** 
*  Analyzes a set of lines and gives a recommendations which seperators can be used 
*/

/**
 * TODO/IDEAS
 * - refactor redundant code in function 'analyze' -> make code more generic 
 * 
 */

var setOfLines = [];
var _setToAnalyze;

//Struct like data-holder for element types 
const elementTypes = { 
    specialcharacter: "specialcharacter",   //,+$% or similar special characters  
    whitespace: "whitespace",               
    word: "word",                           //Group of characters known as word 
    number: "number",                       //Number with or without decimals 
    inBrackets: "inBrackets",                //Content in brackets 
    notAssigned: "notAssigned"                 //Placeholder for not assigned values 
}


//Class for creating a classified element 
function classifiedElement(){
    this.type = elementTypes.notAssigned,
    this.linePosition_characters= [-1,-1], //Position in original string in character-length [start,end]
    this.linePosition_segments= -1,        //Position in segments after element-segmentation
    this.sectorPosition= -1,               //Position in field of normalized sectors 
    this.content=""                        //The actual content as a string 
}

//Class which represents the combination of classified elements for one line + additional information  
function lineElement(){
    this.line_length = -1,         //length of original line 
    this.line        = -1,         //original line itsel 
    this.line_position = -1,       //position of the original line in original set  
    this.classifiedElements  = []; //The set of classfied elements 
}

//Class represents the whole set to analyze 
function setToAnalyze(){
    this.set_length = -1,
    this.set_name ="",      //Can be a category like aufsichtsrat or something 
    this.lineElements = []  
} 
 


function addLineToSet(line){
    setOfLines.push(line);
}

function addLineArrayToSet(linearray){
    if(!linearray)return;
    for(var i=0;i<linearray.length;i++){
        addLineToSet(linearray[i]);
    }
}

function deleteSetOfLines(){
    setOfLines=[];
}

function createLocalDataset(options){
    _setToAnalyze = new setToAnalyze();
    if(options){
        if(options.name){
            _setToAnalyze.set_name = options.name;  
        }
    }

    var seperatorSign = "¦";
    var lineElements=[];

    for(var i=0;i<setOfLines.length;i++){
        var currentline           = setOfLines[i];
        var currentline_numchars  = currentline.length;

        console.log("CURLINE",currentline);


        if(!currentline || currentline==="") continue; 
        var currentlineWithSeperators=currentline;
        var currentlineForPosition   =currentline; //This is just a helper string for getting the absolute position of matches 

        //Substitute matches within parenthesis with indices in the string         
        var matchBracketsRegex = new RegExp(/\(.*\)/g);
        var matchBrackets = currentlineWithSeperators.match(matchBracketsRegex);
        var matchBracketsIndices = [];
        
        if(matchBrackets && matchBrackets.length>=1){
            for(var x=0;x<matchBrackets.length;x++){
                var replacement = seperatorSign+"matchBrackets"+seperatorSign;
                currentlineWithSeperators = currentlineWithSeperators.replace(matchBrackets[x],replacement);
            }
            //Find indices - this matches only single entries even if global regex, therefore has to be repeated 
            while (match= matchBracketsRegex.exec(currentlineForPosition)){
                if(!match){
                    debugger;     
                    throw "This shouldn't happen"
                }
                var replacementForPosition = createSeriesOfCharacter(seperatorSign,match[0].length); 
                currentlineForPosition = currentlineForPosition.replace(match[0],replacementForPosition);     
                matchBracketsIndices.push([match.index, match.index+match[0].length]);
            }
            if(matchBrackets.length != matchBracketsIndices.length){
                debugger; //Also shouldn't happen 
            }
        }

        //Substitute matches which have numbers (not in parenthesis) in the string
        var matchNumberNotInBrackets = regLib.matchNumber(currentlineWithSeperators);
        var matchNumberNotInBracketsRegex = regLib.matchNumber(null,true); //return the used regex 
        var matchNumberNotInBracketsIndices = [];

        if(matchNumberNotInBrackets && matchNumberNotInBrackets.length){
            for(var x=0;x<matchNumberNotInBrackets.length;x++){
                var replacement = seperatorSign+"matchNumberNotInBrackets"+seperatorSign;
                currentlineWithSeperators = currentlineWithSeperators.replace(matchNumberNotInBrackets[x],replacement);
            }
        
            for(var x=0;x<matchNumberNotInBrackets.length;x++){
                currentlineWithSeperators = currentlineWithSeperators.replace("matchNumberNotInBrackets","matchNumberNotInBracketz"+x);
            }

            //Find indices - this matches only single entries even if global regex, therefore has to be repeated 
            while (match= matchNumberNotInBracketsRegex.exec(currentlineForPosition)){
                if(!match){
                    debugger;     
                    throw "This shouldn't happen"
                }
                var replacementForPosition = createSeriesOfCharacter(seperatorSign,match[0].length); 
                currentlineForPosition = currentlineForPosition.replace(match[0],replacementForPosition);     
                matchNumberNotInBracketsIndices.push([match.index, match.index+match[0].length]);
            }
        }

        //Matches all characters except numbers, alphabet and seperator sign 
        var specialCharactersRegex = new RegExp("[^a-zA-Z0-9_."+seperatorSign+"]+","g"); 
        var matchSpecialCharacters = currentlineWithSeperators.match(specialCharactersRegex); 
        var matchSpecialCharactersIndices = [];


        if(matchSpecialCharacters && matchSpecialCharacters.length){
            for(var x=0;x<matchSpecialCharacters.length;x++){
                var replacement = seperatorSign+"matchSpecialCharacters"+x+seperatorSign;
                currentlineWithSeperators = currentlineWithSeperators.replace(matchSpecialCharacters[x],replacement);
            }


            //Find indices - this matches only single entries even if global regex, therefore has to be repeated 
            while (match= specialCharactersRegex.exec(currentlineForPosition)){
                if(!match){
                    debugger;     
                    throw "This shouldn't happen"
                }
                var replacementForPosition = createSeriesOfCharacter(seperatorSign,match[0].length); 
                currentlineForPosition = currentlineForPosition.replace(match[0],replacementForPosition);     
                matchSpecialCharactersIndices.push([match.index, match.index+match[0].length]);
            }
        }

        //TODO Indices for words 


        //2008:     Aufsichtsräten 
        //{BLOCK,BLOCK:(BLOCK)} 
        //{BLOCK,BLOCK:(BLOCK)} 
        var finalLineSplit = []; 

        var splitRegex = new RegExp(seperatorSign+"+","g"); 
        var currentlineSplit = currentlineWithSeperators.split(splitRegex); //SPlit besser 
        var bracketsMatchIndex = 0; 

        for(var x=0;x<currentlineSplit.length;x++){
            var splititem = currentlineSplit[x];

            if(!splititem) continue;

            if(splititem.indexOf("matchBrackets")!=-1){

                var ce = new classifiedElement();
                ce.linePosition_segments = finalLineSplit.length;  
                ce.linePosition_characters =matchBracketsIndices[bracketsMatchIndex];
                ce.type = elementTypes.inBrackets;
                ce.content = matchBrackets[bracketsMatchIndex]; 

                finalLineSplit.push(ce);
                bracketsMatchIndex = bracketsMatchIndex+1; 

                
            }else if(splititem.indexOf("matchNumberNotInBracketz")!=-1){
                var numberMatch = regLib.matchNumber(splititem);
                if(numberMatch && numberMatch.length>=1){
                   var ce = new classifiedElement();
                   ce.linePosition_segments = finalLineSplit.length; 
                   ce.linePosition_characters = matchNumberNotInBracketsIndices[numberMatch[0]]; 
                   ce.type = elementTypes.number;
                   ce.content = matchNumberNotInBrackets[numberMatch[0]]; 
                   finalLineSplit.push(ce);
                }
            }else if(splititem.indexOf("matchSpecialCharacters")!=-1){
                var numberMatch = regLib.matchNumber(splititem);
                if(numberMatch && numberMatch.length>=1){
                    var ce = new classifiedElement();
                   ce.linePosition_segments = finalLineSplit.length;  
                   ce.linePosition_characters = matchSpecialCharactersIndices[numberMatch[0]]; 
                   ce.type = elementTypes.specialcharacter;
                   ce.content = matchSpecialCharacters[numberMatch[0]]; 
                   finalLineSplit.push(ce);
                }
            }else{
                //Here the substitution only matches the first entry 
                var wordMatchRegex = new RegExp(splititem);
                var match = wordMatchRegex.exec(currentlineForPosition);
                if(!match){
                    debugger;     
                    throw "This shouldn't happen";
                }
                var replacementForPosition = createSeriesOfCharacter(seperatorSign,match[0].length); 
                currentlineForPosition = currentlineForPosition.replace(match[0],replacementForPosition);   
                var recognizedIndices =   [match.index, match.index+match[0].length];

                /*
                    if(!match){
                        debugger;     
                        throw "This shouldn't happen"
                    }
                    var replacementForPosition = createSeriesOfCharacter(seperatorSign,match[0].length); 
                    currentlineForPosition = currentlineForPosition.replace(match[0],replacementForPosition);     
                    matchSpecialCharactersIndices.push([match.index, match.index+match[0].length]);
                */

                var ce = new classifiedElement();
                ce.linePosition_segments = finalLineSplit.length;  
                ce.linePosition_characters = recognizedIndices;
                ce.type = elementTypes.word;
                ce.content = splititem; 
                finalLineSplit.push(ce);
            }
        }

        //Create a checkstring from found stuff 
        var checkstring=""; 
        for(var x=0;x<finalLineSplit.length;x++){
            checkstring = checkstring+finalLineSplit[x].content;
        }
        console.log("CHEKSTR",checkstring);


        //Add the string to a set of lines 
        var line_element =new lineElement();
        line_element.line          = currentline;
        line_element.line_length   = currentline_numchars;  
        line_element.classifiedElements = finalLineSplit;
        line_element.line_position = i; 
        
        lineElements.push(line_element); 
    }

    _setToAnalyze.lineElements = lineElements;

}

function analyzeDataset(){


}


function createSeriesOfCharacter(char,number){
    var series="";
    for(var i=0;i<number;i++){
        series = series + char; 
    }
    return series; 
}



module.exports = {
    addLineToSet,
    addLineArrayToSet,
    deleteSetOfLines,
    createLocalDataset
}
