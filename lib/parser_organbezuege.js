/**
 * Parser functions for organbezüge related content
 */
var utils             = require('./utils');
var cfw               = require('./checkfileWriter');
var regLib            = require('./regexLib');


/**
 * Parses content matched with 'Organbezug' into the value given in ret
 * @param {string} organbezuege semicolon seperated line with data for organbezüge 
 * @param {int} originline index of original line related to this entry, mainly used for logging  
 * @param {int} i index of the last line related to this entry, for return value for next entry 
 * @param {object} ret object for parsing-json files, results of the parsing gets added to this object 
 */
function parseOrganbezuege(organbezuege,originline,i,ret){
    organbezuege = regLib.replaceSemicolonAndCommaInBrackets(organbezuege);
    //Check if there are multiple years or just one
    var yearmatch = organbezuege.match(/\d\d\d\d/g);
    var oneYearForAll; 
    var multiYearFallback;
    if(yearmatch==null){
        console.log("tag");
    }else if(yearmatch.length==1){
        oneYearForAll = yearmatch[0]; 
    }else if(yearmatch.length>1){
        multiYearFallback = yearmatch[0]; //Sometimes there is a line with multiple years, but one entry has no year for that use this variable 
    }

    organbezuege.split(/\s*;\s*/).trimAll().forEach(_ => {      
        var waehrungRegex = new RegExp(/(TDM)|(DM)|(TEUR)|(EUR)/);
        var jahr; 
        var organ;
        var bezuege;
        var bemerkung;

        if(oneYearForAll){
            //If ONE YEAR was recognized, each entry is: 'Organ: Bezüge' 
            //Filter exceptions 
            if(_.indexOf("keine Vergütung")!=-1){
                jahr = oneYearForAll; 
                bemerkung = _.replace(jahr,'').replace(':','').trim();
            }else{
                //Standard parsing 
                jahr = oneYearForAll; 
                var _withoutYear = _.replace(jahr,'').trim();
                var waehrungmatch = _withoutYear.match(waehrungRegex);
                if(waehrungmatch!=null){
                    var waehrung = waehrungmatch[0];
                    var weaReg = new RegExp(waehrung); 
                    var linesplit = _withoutYear.split(weaReg);                       
                    organ = linesplit[0].replace(':','').trim();
                    bezuege = waehrung +" "+linesplit[1].trim();
                }else{
                    bemerkung = _withoutYear;
                }
            }
        }else{
            //If multi years were recognized, each entry is Organ year: bezüge      
            var yearmatch = _.match(/\d\d\d\d(\/\d\d)*/g); //Match the year which can be something like 1996 or 1995/96
            if(yearmatch!=null){
                jahr = yearmatch[0];
                var _withoutYear=_.replace(jahr,'').trim();
                var waehrungmatch = _withoutYear.match(waehrungRegex);
                if(waehrungmatch!=null){
                    var waehrung = waehrungmatch[0];
                    var weaReg = new RegExp(waehrung); 
                    var linesplit = _withoutYear.split(weaReg);
                    if(linesplit.length>1){
                        organ = linesplit[0].replace(':','').trim();
                        bezuege = waehrung +" "+linesplit[1].trim();
                    }else{
                        bemerkung = linesplit[0];
                    }                       
                }else{
                    bemerkung = _;
                }
            }else{
                try{
                    var waehrungmatch = _.match(waehrungRegex);
                    if(waehrungmatch!=null){
                        var waehrung = waehrungmatch[0];
                        var weaReg = new RegExp(waehrung); 
                        var linesplit = _.split(weaReg);
                        if(linesplit.length>1){
                            jahr = multiYearFallback;
                            organ = linesplit[0].replace(':','').trim();
                            bezuege = waehrung +" "+linesplit[1].trim();
                        }else{
                            bemerkung = linesplit[0];
                        }
                    }                       

                }catch(ex){
                    throw "invalid year detected in "+_;
                }
            }
        }
        const organbezug = {jahr, organ, bezuege,bemerkung}; 
        for (let k in organbezug){
            if (!organbezug[k]){
                delete organbezug[k];
            }else{
                organbezug[k] = organbezug[k].replace('()','');
            } 
        } 

        cfw.writeToCheckfile(originline,_,JSON.stringify(organbezug), cfw.config.checkfile_organbezuege ,cfw.config.checkfile_organbezuege_enabled);                                        
        ret.organbezuege = [];
        ret.organbezuege.push(organbezug);
        return i-1;
    });
}


module.exports = {
    parseOrganbezuege
}