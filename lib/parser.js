const fs = require('fs')

const checkfile_aufsichtsrat_enabled =true; 
const checkfile_aufsichtsrat = "Checkfile_Aufsichtsrat.txt";
const checkfile_vorstand_enabled = true; 
const checkfile_vorstand ="Checkfile_Vorstand.txt"; 
const checkfile_geschleitung_enabled = true; 
const checkfile_geschleitung ="Checkfile_Geschleitung.txt"; 

//Clear files at startup 
fs.writeFileSync(checkfile_aufsichtsrat,'');
fs.writeFileSync(checkfile_vorstand,'');


var dictionaryHandler = require('./dictionaryHandler'); 


Array.prototype.trimAll = function() {
    this.forEach((v,idx) => this[idx] = v.trim())
    return this
}

String.prototype.splitAtFirst = function(sep) {
    const idx = this.indexOf(sep)
    return [this.substr(0, idx), this.substr(idx+sep.length)]
}

function _parsePersonName(raw) {
    var ret = {}
    raw.trim().replace(/^((?:(?:[A-Z]{2,} )?[A-ZÖÄÜ][a-zA-Zöäü\.-]+)?\s)?(.*?)\s([A-Za-zöäü]+)$/,
        (_, title, firstName, lastName) => {
            ret = {title, firstName, lastName}
        })
    ret.full = raw
    return ret
}



/**
 * Detect First Name and Lastname from given name and also the function which is in '()'  
 * @param {string} data: An example input string looks like this: Jane Vaine (Vors.) 
 * Currently used for:
 * Aufsichtsrat 
 * 
 * @returns {object} which contains the detected name and function and indicators if these properties could be found 
 **/ 
function detectNameAndFunct(data){
    
    var returnobj = {
        detectedName:"", 
        hasName: false,
        detectedFunct:"",
        hasFunct: false,
        firstname:"",
        lastname:""
    }

    
    try{

        //Check if funct is in ()      
        var returnmatch = data.match(/\((.*?)\)/);
        
        if(returnmatch!=null){
            returnobj.hasFunct = true; 
            returnobj.detectedFunct = returnmatch[1];
            returnobj.hasName = true; 
            returnobj.detectedName =  data.replace(returnmatch[0],"").trim(); 
        }else{
            returnobj.hasName = true; 
            returnobj.detectedName = data;
        }
        /*
        if(data.indexOf("Claude Bébéar")!=-1){
            console.log("You win a price! ");
        }
        */
        //Split name in first and lastname 
        var namesplit = returnobj.detectedName.trim().split(' ');
        var lastname = namesplit[namesplit.length-1]; //Just take the last element
        var firstname = returnobj.detectedName.replace(lastname,""); 
        returnobj.lastname = lastname; 
        returnobj.firstname = firstname; 

        return returnobj;

    }catch(ex){
        console.error("Problem detecting name and funct for ",data," exception ",ex); 
        return null;   
    }
}

function writeHeaderToCheckFile(header,filetowrite,activated){
    if(!activated)return; 
    try{
        fs.appendFileSync(filetowrite,header + "\r\n");
    }catch(ex){
        console.log(" Exception ",ex);
    }
}

function writeToCheckfile(linenumber,dataorigin,dataparsed,filetowrite,activated){
    if(!activated)return; 
    try{
        fs.appendFileSync(filetowrite,"line of origin:" +linenumber+ "\r\n");
        fs.appendFileSync(filetowrite,"origin: "+dataorigin + " \r\n");
        fs.appendFileSync(filetowrite,"parsed "+dataparsed+ "\r\n "); 
    }catch(ex){
        console.log(" Exception ",ex);
    }

}   

module.exports = class CdHtmlParser {

    constructor() {
        this._parseFunctions = [
            {
                match: 'Wertpapier-Kenn-Nr.:',
                fn: (lines, i, ret) => {
                    lines[i].replace(/\d+$/, (_) => { 
                        ret.wkn = parseInt(_) 
                    })
                    return i
                }
            },
            {
                match: 'ISIN:',
                fn: (lines, i, ret) => {
                    lines[i].replace(/[^>]+$/, (_) => { 
                        ret.isin = _ 
                    })
                    return i
                }
            },
            {
                match: '<b>Sitz</b>',
                fn: (lines, i, ret) => {
                    try{
                    i += 1
                    var addressLines = ''
                    return; //JS: hier momentan einfach abbrechen bis Fehler behoben sind
                    do { addressLines += lines[i++] }
                    while (!(lines[i].match('<!-- weitere Sitze -->'))) //JS: Das produziert eine Index Out Of Bounds exception wenn das Tag nicht vorhanden ist 
                    const addressParts = addressLines.split('<br>').trimAll()
                    const [street_with_number, city_with_zip] = addressParts.shift().split(',').trimAll()
                    street_with_number.replace(/(.*?)\s*(\d+)$/, (_, street, street_number) => {
                        ret.street = street
                        ret.street_number = (street_number)
                    })
                    if (city_with_zip) city_with_zip.replace(/^(\d+)\s*(.*)/, (_, zip, city) => {
                        ret.zip = zip
                        ret.city = city
                    })
                    for (let addressPart of addressParts) {
                        const [k, v] = addressPart.splitAtFirst(':')
                        if (!k) continue
                        if (k.match('Telefon')) ret.phone = v
                        else if (k.match('Telefax')) ret.fax = v
                        else if (k.match(/e.mail/)) ret.email = v.split(/\s*,\s*/)
                        else if (k.match('Internetseite')) ret.www = v.split(/\s*,\s*/)
                        else console.error(`Unknown addressPart ${k}=${v}`)
                    }
                    return i
                    }catch(ex){
                        console.log(" exception during match  ",ex);
                    }
                },
            },
            {
                match: 'Tätigkeitsgebiet/Gründung',
                disabled: false,
                fn: (lines, i, ret) => {
                    i += 1
                    var activity_description = ''
                    do { activity_description += lines[i++] }
                    while (!(lines[i].match('<b>')))
                    ret.activity_description = activity_description.replace(/<br>/g, '\n')
                    return i-1
                }
            },
            {
                match: '<br><b>Gründung',
                fn: (lines, i, ret) => {
                    lines[i].replace(/\d+/, (_) => ret.established_year = parseInt(_))
                    return i
                }
            },
            {
                match: '<b>Status:',
                fn: (lines, i, ret) => {
                    lines[i].replace(/[^>]+$/, (_) => ret.status = _)
                    return i
                }
            },
            {
                match: '>Beschäftigte',
                disabled: false,
                fn: (lines, i, ret) => {
                    var employee_stats = []
                    const ucStyle = lines[i].match('LEFT')
                    while (!(lines[i++].match('</table>'))) {
                        if (!(lines[i].match('<td'))) continue
                        const stat = lines[i].replace(/<[^>]+>/g, '').trim()
                        if (ucStyle) {
                            if (lines[i].match('width') || lines[i].match('LEFT')) continue
                            employee_stats.push(stat)
                        } else {
                            employee_stats.push(stat)
                        }
                    }
                    ret.employee_stats = employee_stats
                    return i
                }
            },
            {
                match: 'b>Aufsichtsrat:</b><br>',
                fn: (lines, i, ret) => {
                    var originline = i; 
                    i += 1
                    var aufsichtsrat = ''
                    do { aufsichtsrat += lines[i++].replace('<br>', '') }
                    while (!(lines[i].match('<b>')))
                    ret.aufsichtsrat = []
                    aufsichtsrat.split(/\s*;\s*/).trimAll().forEach(_ => {                                                       
                        //console.log("Line to check is: ",_);
                        var manager = checkAufsichtsrat(_,originline);
                        ret.aufsichtsrat.push(manager);
                        return i-1;
                    });
                }
            },
            {
                match: 'b>Aufsichtsrat: </b><br>',
                fn: (lines, i, ret) => {
                    var commonfunct_isThere = false; 
                    var commonfunct=''; 

                    var originline = i;                 
                    var aufsichtsrat = lines[i].replace(/b>Aufsichtsrat: <\/b><br>/i,'');   //replace aufsichtsrat starter 
                    aufsichtsrat = aufsichtsrat.replace(/<br>|<|>/gi,'');                   //replace html tag rests
                    i += 1 
                    do { 
                        //Sometimes a common title with abbreviation is there, line looks like:"*) Arbeitnehmervertreter<br>"
                        if(lines[i].match(/^\*\)/)){
                            var recline = lines[i];
                            commonfunct = recline.replace('*)','').replace('<br>','').trim();
                            commonfunct_isThere = true; 
                        }
                        aufsichtsrat += lines[i++].replace('<br>', '');                        
                    }while (!(lines[i].match('<b>')))
                    ret.aufsichtsrat = []
                    aufsichtsrat.split(/\s*;\s*/).trimAll().forEach(_ => {                                                       
                        //console.log("Line to check is: ",_);
                        var manager = checkAufsichtsrat(_,originline,commonfunct_isThere,commonfunct);
                        writeToCheckfile(originline,_,JSON.stringify(manager), checkfile_aufsichtsrat ,checkfile_aufsichtsrat_enabled);                                        
                        ret.aufsichtsrat.push(manager);
                        return i-1;
                    });
                }
            },
            {
                match: 'b>Vorstand:</b><br>',
                fn: (lines, i, ret) => {
                    var originline = i;                 
                    i += 1
                    var vorstand = ''
                    do { vorstand += lines[i++].replace('<br>', '') }
                    while (!(lines[i].match('<b>')))  
                    ret.vorstand = []

                    vorstand = replaceSemicolonInBrackets(vorstand); 

                    var iend = parseVorstand(vorstand,originline,i,ret);
                    return iend; 
                }
            }, 
            {
                match: 'b>Vorstand: </b><br>',
                fn: (lines, i, ret) => {
                    var originline = i;       
                    var lineBRsplit = lines[i].split('<br>');
                    if(lineBRsplit.length <1) throw "Exception in lineBRsplit";
                    var lineBRsplice = lineBRsplit.splice(1);    
                    i += 1
                    var vorstand = '';
                    for(var x=0;x<lineBRsplice.length; x++){
                       vorstand+=lineBRsplice[x]; 
                    }       
                    ret.vorstand = []

                    var iend = parseVorstand(vorstand,originline,i,ret);
                    return iend;                 
                }
            },




            {
                match: 'b>Geschäftsleitung:</b><br>|b>Geschäftsleitung: </b><br>',
                fn: (lines, i, ret) => {
                    var originline = i;                 
                    i += 1
                    var vorstand = ''
                    do { vorstand += lines[i++].replace('<br>', '') }
                    while (!(lines[i].match('<b>')))  
                    ret.vorstand = []
                    vorstand.split(/\s*;\s*/).trimAll().forEach(_ => {              //Split all entries between semicolon and trim
                        _.replace(/([a-zäöü\s\.-]+)(?:\(([^\)]+)\))?(?:, (.*))?/i,  //Capture the most characters statements in first froupt don't match stuff in 
                        (_, name, funct, city) => {
                            console.log(" Geschäftsleitung: ",_);

                            const {title, firstName, lastName} = _parsePersonName(name)
                            const manager = {title, firstName, lastName, city, funct}
                            for (let k in manager) if (!manager[k]) delete manager[k]
                            ret.vorstand.push(manager)
                            console.log(" manager: ",manager);                                               
                            writeToCheckfile(originline,_,JSON.stringify(manager), checkfile_geschleitung ,checkfile_geschleitung_enabled);                                        

                        })
                    })
                    return (i-1)
                }
            },
        ]
    }

    parseFile(filename) {
        console.log("Parser.js parsing file: ",filename);
        writeHeaderToCheckFile(filename+"-----------------------------",checkfile_aufsichtsrat,checkfile_aufsichtsrat_enabled);
        writeHeaderToCheckFile(filename+"-----------------------------",checkfile_vorstand,checkfile_vorstand_enabled);

        dictionaryHandler.createTitlesDict();
        dictionaryHandler.createFunctionsDict();
        return this.parse(fs.readFileSync(filename, {encoding: 'utf8'}))
    }

    parse(linesStr) {
        const lines = linesStr.split('\n')
        const ret = {}
        ret._fulltext = linesStr
            .replace(/<head>[\s\S]*<\/head>/i,'')   //replace all whitespace and non-whitespace characters between the header and the header tags 
            .replace(/<[^>]+>/g,'')                 //replace all html opening or closing tags in this script
      
        for (let i = 0; i < lines.length; i++) {
            
            for (let parseFunction of this._parseFunctions) {
                
                //if the line matches a string in the parsefunction match call the corresponding parser function 
                var lineTrim = lines[i].trim(); 

                if (lineTrim.match(parseFunction.match) && !parseFunction.disabled) {
                    i = parseFunction.fn(lines, i, ret) || i
                    break
                }
            }
        }
        return ret
    }
}

function checkAufsichtsrat(_,originline,commonfunct_isThere,commonfunct){
    var linesplit = _.split(',');           //comma seperated line 
    var nameStartIndex=-1; 
    var currentIndex =-1;                       
    var nameAndFunctInfo;                   //object for storing detected name and funct 
    var titleInfo;                          //object for storing detected title

    /*
    if(_.indexOf("Gerd Woriescheck")!=-1){
        console.log(" Secret found! "); 
    }
    */


    //Title detection 
    var matchingOption ="normal";           //'normal' or 'ldist' is possible 
    titleInfo = dictionaryHandler.checkIfTitleIsInArray(linesplit,',',matchingOption);  

    //Name and Funct detection 
    var functLastLineInfo = dictionaryHandler.checkIfaFunctContentIsInString(linesplit[linesplit.length-1]); 
    if(functLastLineInfo.isTitle){  //If the title was recognized in lastline delete it to not confuse further processing 
        if(!functLastLineInfo.hasRest || functLastLineInfo.dataWithoutTitle.trim().length==0){ //if there is no rest or the rest are just spaces ... 
            linesplit =  linesplit.splice(0, linesplit.length-1);
        }
        if(functLastLineInfo.hasRest){
            linesplit[linesplit.length-1] = functLastLineInfo.dataWithoutTitle.trim();
        }
    }
    if(!titleInfo.hasName && !titleInfo.hasTitle){
        currentIndex=0; //Proceed with the first element for name detection 
        nameAndFunctInfo = detectNameAndFunct(linesplit[currentIndex].replace('*)','')); 
        currentIndex = currentIndex+1; 
    }
    else if(titleInfo.hasName){
        nameAndFunctInfo = detectNameAndFunct(titleInfo.nameDetected.replace('*)',''));
        currentIndex = titleInfo.nextIndex;
    }else {
        try{

            //Index is not placed right atm....
            var lineToCheck = linesplit[titleInfo.nextIndex];

            nameAndFunctInfo = detectNameAndFunct(lineToCheck.replace('*)',''));
            currentIndex = titleInfo.nextIndex; 
        }catch(ex){
            console.log("Exception at line ",originline," with string ",_);
        }
    }



    //City detection (also for special cases funct is already detected) 
    var funct =""; 
    var cityAcc=""; 
    for(var i=currentIndex;i<linesplit.length;i++){
        try{
            var lineToApply = linesplit[i]; 

            if(linesplit[i].match(/\*\)/g)){
                //This is a specific case which contains actually the function 
                lineToApply = lineToApply.split("*)")[0].trim();
            }
            //JS this is temporary to see if there are more entries then 3 for the city
            if(cityAcc===""){
                cityAcc = lineToApply.trim();
            }else{
                cityAcc = cityAcc +" ("+lineToApply.trim()+")";  
            }
        }catch(ex){
            console.log(" Exception ",ex);
        }
    }
    /*
    console.log("Title:   ",titleInfo.titleDetected);
    console.log("Function:",nameAndFunctInfo.detectedFunct); 
    console.log("Firstname:    ",nameAndFunctInfo.firstname);
    console.log("Lastname:    ",nameAndFunctInfo.lastname);                      
    console.log("City:    ",cityAcc);
    */
    var title = titleInfo.titleDetected; 
    var firstName = nameAndFunctInfo.firstname; 
    var lastName = nameAndFunctInfo.lastname; 
    var funct = functLastLineInfo.isTitle? functLastLineInfo.titleFound : nameAndFunctInfo.detectedFunct; //If function is in the lastline take it from there otherwise from brackets 
    if(commonfunct_isThere){ //A common funct can be there for a set of multiple lines, but for the specific lines it needs to be matched again
        if(_.indexOf('*)')!=-1){
            cityAcc = cityAcc.replace('*)','');
            if(funct.trim()!==commonfunct.trim()){ //Without this there could be double 'Arbeitnehmervertreter' i.e. in the final funct
                funct +=" "+ commonfunct;
                funct = funct.trim();    
            }
        }       
        //In this case the formatting is also different d
    }
    //"Theo Biermann, Bocholt *)"
    //"Gerd Woriescheck, Stuttgart*) Arbeitnehmervertreter" //doesn't recognize stuttgart 
    const manager = {title, firstName, lastName, cityAcc, funct}; 
    for (let k in manager) if (!manager[k]) delete manager[k]

    //console.log(" manager: ",manager);      
    return manager; 
}


function parseVorstand(vorstand,originline,i,ret){
    vorstand = replaceSemicolonInBrackets(vorstand); 

    vorstand.split(/\s*;\s*/).trimAll().forEach(_ => {              //Split all entries between semicolon and trim

        if(_.indexOf("Klaus-Dieter Peters")!=-1){
            console.log(" Next line should be added also they seem interconnected no ; in the function brackets should split the whole string ");
        }
        
        if(_.indexOf("Yi Cuan Wang")!=-1){
            console.log(" Yi is recognized as title ");
        }

        if(_.indexOf("Gerard A. Janssen")!=-1){
            console.log(" function in klammern nicht erkannt ");
        }
        
        if(_.indexOf("Michael Pistauer")!=-1){
            console.log(" function is also title ");
        }
        var manager = checkAufsichtsrat(_,originline);
        writeToCheckfile(originline,_,JSON.stringify(manager), checkfile_vorstand ,checkfile_vorstand_enabled);                                        
        ret.vorstand.push(manager);
        return i-1;
    })
}


/**
 * Replaces all occurences of ';'-character WITHIN brackets '()' in the given string with ' ' 
 * @param {string} inputString input data which can have brackets i.e. "This, is (bracketcontent;semicolon);other stuff (bracketcontent)"
 * @returns {string} corrected input string without brackets 
 **/
function replaceSemicolonInBrackets(inputString){
    var bracketsList = inputString.match(/\((.*?)\)/g);
    if(bracketsList==null) return inputString; 
    
    for(var x=0;x<bracketsList.length;x++){
        var inBrackets = bracketsList[x];
        if(inBrackets && (inBrackets.indexOf(';')!=-1||inBrackets.indexOf(',')!=-1)){
            var newInBrackets = inBrackets.replace(/;/g,' ');
            newInBrackets = newInBrackets.replace(/,/g,' ');
            inputString = inputString.replace(inBrackets,newInBrackets); //Replace ; within brackets with whitespace 
        }
    }
    return inputString; 
}


