var regLib       = require('./regexLib');
var cfw          = require('./checkfileWriter');
var utils        = require('./utils.js');




/**
 * 
 * @param {*} linesBoersenbewertung lines segmented for boersenbewertung 
 * @param {int} callnumber how often was this function called, it's an index which helps to identify the returnobject later
 */
function parse_boersenbewertung(linesBoersenbewertung,callnumber){
    var returnobject = {};  

    function isin(){
        this.nummer;
        this.aktienart;
    }
    function wkn(){
        this.nummer;
        this.aktienart;
    }
    var nextlineIsNotiert = false; //Indicates, that the following lines in the array are 'notizen'

    for(var i=0;i<linesBoersenbewertung.length;i++){
        var currentline = linesBoersenbewertung[i];
        if(!currentline) continue;
        var currentlineLC = currentline.toLowerCase();

        if(currentlineLC.indexOf("wertpapier-kenn-nr")!=-1){
            //Parse WKN line 
            var wknObj = new wkn();
            var numMatch = regLib.matchNumber(currentline);
            if(numMatch && numMatch.length >=1){
                wknObj.nummer = numMatch[0];
            }
            var currentlineSplit = currentline.split(',');
            if(currentlineSplit.length >=2){
                var wknInfo = utils.htmlText2Text(currentlineSplit[1]);
                wknObj.aktienart = wknInfo;
            }
            if(!returnobject.wkns){
                returnobject.wkns = [];
            }

            returnobject.wkns.push(wknObj);
        }else if(currentlineLC.indexOf("isin:")!=-1){
            var isinObj = new isin();
            var currentlineSplit = currentline.split(',');
            if(currentlineSplit[0]){
                var currentlineSplitSplit = currentlineSplit[0].split(':');
                if(currentlineSplitSplit[1]){
                    isinObj.nummer = utils.htmlText2Text(currentlineSplitSplit[1]).trim();
                }
            }
            if(currentlineSplit[1]){
                var isinInfo = utils.htmlText2Text(currentlineSplit[1]).trim();
                if(isinInfo){
                    isinObj.aktienart = isinInfo;
                }
            }
            if(!returnobject.isins){
                returnobject.isins = [];
            }
            returnobject.isins.push(isinObj);

        }else if(currentlineLC.indexOf("marktbetreuer")!=-1){
            var currentlineSplit = currentline.split(':');
            if(currentlineSplit[1]){
                var marktbetreuerInfo = utils.htmlText2Text(currentlineSplit[1]).trim();
                if(!returnobject.marktbetreuer){
                    returnobject.marktbetreuer = [];
                }
                returnobject.marktbetreuer.push(marktbetreuerInfo);
            }
        }else if(nextlineIsNotiert){
            var clineSplit = currentline.split("<br>");
            for(var xy=0;xy<clineSplit.length;xy++){

                var notizInfo = utils.htmlText2Text(clineSplit[xy]).trim();
                if(notizInfo){
                    if(!returnobject.notizen){
                        returnobject.notizen = [];
                    }
                    returnobject.notizen.push(notizInfo);
                }
            }
                
        }else if(currentlineLC.indexOf("notiert")!=-1){
            var clineSplit = currentline.split("<br>");
            for(var xy=0;xy<clineSplit.length;xy++){
                var notizInfo = utils.htmlText2Text(clineSplit[xy]).replace("Notiert:",'').trim();
                if(notizInfo){
                    if(!returnobject.notizen){
                        returnobject.notizen = [];
                    }
                    returnobject.notizen.push(notizInfo);
                }else{
                    //Nextline is notiert, indicate the next lines belon to 'notizen'
                    nextlineIsNotiert = true;              
                }

            }


        }else{
            var maybeBemerkung = utils.htmlText2Text(currentline).trim();
            if(maybeBemerkung){
                if(!returnobject.bemerkungen){
                    returnobject.bemerkungen =[];
                }
                returnobject.bemerkungen.push(maybeBemerkung);
            }
        }

    }
    var key = "boersenbewertung"+callnumber;
    var realReturnObject = {
        [key]: returnobject
    }
    return realReturnObject;
}








module.exports = {
    parse_boersenbewertung
}