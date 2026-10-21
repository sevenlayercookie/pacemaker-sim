/*  ABSTRACTION
      Data Description:
        - 500 Hz EKG data
        - so should data be drawn at 500 fps? can device handle that?
      Two parts:
        I.  Data processor - cycles through EKG data
        II. Painter - paints the canvas
    - painter should run at browser framerate (max for device) for smoothness
    - data processor should run as fast as possible, but 

    width = 1000 pixels

    60  bpm = 1 beat / 1000 msec

    R-R should take one second to paint
      - # data points per R-R = 500 Hz * 1 second = 500 data points

    so 500 data points should be processed every second
    paint will paint at Max Browser Framerate. So data processing should be 500/Max Browse Frame Rate and then paint 

PHYSIOLOGY POINTS
 - in typical conduction scenarios, SA node is NOT affected by ectopic impulses, including those coming from the ventricle.
    - it can however sometimes be reset by ectopic impulses (non-compensatory pause)
        - for simplicity, might just ignore this and do only compensatory pauses (consistent P clock throughout)
    - so, any PVCs should NOT disturb the timing of the SA node
    - this doesn't mean we will always see a P wave though (the SA can fire, but not cause atrial contraction if the surrounding tissue is refractory)
    - so after a PVC/PJC/PAC, maybe no P wave, but the next P will be right on time with original P-P interval (compensatory pause)
    - program relevance: there needs to be an absolute sinus interval/clock (P-P interval) that is not affected by ectopy (PVCs, pacing, etc.)



*/

// -------------------------- GLOBAL DEFINITIONS -----------------------------
var pacedBeatFlag = false;
var ventRefractoryTimer = 9999
var atrialRefractoryTimer = 9999
var afibPSenseTimer = 9999
// Wenkebach
var baseWenkPR = 150
var currentWenkPR = baseWenkPR
var wenkDegree = 3 // # of conducted beats before drop
var wenkCount = 0 // current count of conducted beats
var wenkPRincreaseAmount  = 100 // by how much should PR interval increase?
var intermittentAVblock = false;
var AVBlockRandom = 1 // random factor of AV block
var lastBlocked = false;
var ratioBlockedPs = .20 // 20% of P's will be blocked
// a flutter vars
  var baselineFlutterConductionRatio = 4; // default 4:1 conduction ratio
  var currentFlutterConductionRatio = baselineFlutterConductionRatio; // this one can be varied for irregularity
  var flutterAtrialRate = 300   // most flutters are around 300 atrial rate
  var flutterAtrialMS = 1/(flutterAtrialRate/60000)
  var flutterConductionIrregularity = 1.5    // 0=regular, up to 2=twice as many frequent blocks
  var flutterVentRate = flutterAtrialRate/baselineFlutterConductionRatio
  var flutterVentMS = 1/(flutterVentRate/60000)
  var flutterAtrialTimer = 10000
// geminy vars
  var geminyRatio = 1   //  1=bigeminy (one normal, one PVC), 2=trigeminy (one normal, two PVC)
  var geminyCount = 0
  var PVCtimer = -1
  var drawNormalQRS = false
  var PPtimer=0
//pacing intervals
var lowerRateLimitTimer // the rate of the pacemaker in ms
var maxTrackingRate = 150 // the highest rate pacer will pace V in response to sensed A's
var AVITimer = 200 // the set interval between a sensed/paced A and associated V (artificial PR interval)
var VAItimer = 1000 - 200 // the timer after sensed/paced V and next due A
var AAtimer = 1000
var VVtimer = 1000
var AVtimer = 200 //used by DOO logic (may be able to combine with AVITimer)
var noiseFlag = false;
var pacingFeedback=true;
var VRP // prevent ventricular sensing of immediate post-V noise (OPTIONAL)
var PVARP // prevent atrial sensing of immediate post-V noise (OPTIONAL)
var upperRateLimit //prevent atrial tracking of atrial tachyarrythmias (OPTIONAL)
var rNEW=0
var rOLD=0
var AVExtension=0
var PRInterval;
// a fib
var random = (1-((Math.random()-0.5)/1))
var aFibMS = 1000
var atrialAfibRate = 600;
var conductedAtimer=Math.round((1/(atrialAfibRate/60000))/2)*2
var afibRandomPtime = 1 
//
var timeSincePGlobal=1;
var timeSinceVGlobal=1;
var timeSinceSensedPGlobal=1;
var timeSinceSensedVGlobal=1;
var HRadjustedPR=120;
var ventHeartRate = 40;
var atrialHeartRate = 80;
var conductionIntact = true;
var avgProcessSpeed = 2;
var goalMS=1000;
var dataCount=0;
var dataClock=0;
var testClock=0;
var setHR = 60;
var CHB = false;
var dataFeedLength=500;
var teleCanvas = document.getElementById("tele");
var teleCtx = teleCanvas.getContext("2d");
var HRCanvas = document.getElementById("HRLayer");
var HRctx = HRCanvas.getContext("2d");
var HRchanged = false;
var paceSpike=false;
var px=0;
h = tele.height
var processingSpeed = 570;
var realtimeProcessSpeed = 2;
var adjustRatio = 1;
var lastBrowserTime = Date.now();
dataHertz = 500, // in Hz (data points per second)
canvasBaseline = tele.height/2+25,
py = canvasBaseline;
var y = dataHertz/144;
var histPTimes=[0];
var histVentTimes = [0];   // each time implies a beat
var aPacerSensitivity = document.getElementById("aSensitivityBox").value; // default 
var vPacerSensitivity = document.getElementById("vSensitivityBox").value; // default 
var aPacerOutput = document.getElementById("aOutputBox").value;
var vPacerOutput = document.getElementById("vOutputBox").value;
var vCaptureThreshold = 5; // default V capture threshold (mA)
var aCaptureThreshold = 2; // default A capture threshold (mA)


// ------------------------- onload () ---------------------------------------
onload();
function onload() {
  // --------------------- LOCAL DEFINITIONS ---------------------------------
  dataFeed.length = 1000;
  dataFeed.fill(0,0,1000);
  //document.getElementById("tele").width = window.innerWidth;
  //document.getElementById("HRLayer").width = window.innerWidth;
  document.getElementById("tele").width = document.getElementById("tele").parentElement.offsetWidth
  document.getElementById("HRLayer").width = document.getElementById("tele").parentElement.offsetWidth

  PRInterval = parseInt(document.getElementById("PRbox").value)
  var w = tele.width,
    
    l = 0,
    sec = 0,
    avgRefresh = 1,
    avgFPS = 144,
    animateRatio = dataHertz / avgFPS,
    dataVoltage = 10, // in mV
    compressHfactor = 20,
    
    opx = 0,
    speed = .2, // speed of the cursor across the screen; affects "squeeze" of waves
    isPainted = true;
    timestamp = performance.now();
    paintCount = 1;
    (opy = py), (scanBarWidth = 1), (PVCflag = 0);
    k = 0;
  teleCtx.strokeStyle = "#00bd00";
  teleCtx.lineWidth = 3;

  // framelimiter code
  var fpsInterval, startTime, now, then, elapsed;

  // initialize the timer variables and start the animation

  var p = 0;
  var i = 0;
  var j = 0;
  var jold = 0;

  // initiate animation (is looped)
  function startAnimating() {
    teleCtx.beginPath();
    for (let i = 0; i < 1200 && isPainted; i++) {
      loop();
    }
  }

  setInterval(updateHertz, 1000);
  startAnimating();

  var lold = 0;
  function updateHertz() {
    sec++;
    avgFPS = document.getElementById("demoTEXT").innerText = l - lold;
    document.getElementById("demoTEXT3").innerText = processingSpeed = j - jold;
    lold = l;
    jold = j;
  }

  function parseData() {
    py = -parseInt(dataFeed.shift() * 1000) / compressHfactor + canvasBaseline;
    if (dataFeed.length < 1000) {
      dataFeed.push(0);
      if (noiseFlag)
      {noiseFunction()}
    }
    j++;
    i++;
    dataCount++;
    dataClock = dataClock + (1/dataHertz)*1000;  // clock for the project

    if (i%100==0) // every 100 data points (200 ms), calc realtime Hz
    {
      randomizeThresholds();
      if (vPacerSensitivity < vOversenseThreshold) // is pacer oversensing?
      {
        sensedVentTimes.push(dataClock)
      }
      if (aPacerSensitivity < aOversenseThreshold)
      {
        sensedPTimes.push(dataClock)
      }
      avgProcessSpeed = calcRealtimeProcessingSpeed();
      if (avgProcessSpeed<2)
      {
        y-=1;
      }
      if (avgProcessSpeed>2)
      {
        y+=1;
      }
    }
    
    tickTimers()  // advance all timers
    masterRhythmFunction()
    if (pacerOn)
    {
      pacingFunction();
    }
    // i=i+parseInt(animateRatio)-1;
    if (dataFeed.length==0)
    {
      py=-(0*1000)/8+canvasBaseline;
      i = 0;
    } 
  }

  function calcRealtimeProcessingSpeed() {
    let browserTimeElapsed = Date.now()-lastBrowserTime;
  

    lastBrowserTime=Date.now();
    return browserTimeElapsed/100;
  }

  function loop() {
    //ctx.canvas.width  = window.innerWidth; // working on screen resizing
    l++; //count # of times through loop
    teleCtx.beginPath();
    //for (let z = 0; z < dataHertz / avgFPS; z++)
    // let y = dataHertz/avgFPS
    
    for (let z = 0; z < y; z++)  
    {
      parseData();
      px += speed; // horizontal pixels per data point

      //if (paceSpike)
        //{drawPacingSpike();}

      teleCtx.moveTo(opx, opy);
      teleCtx.lineTo(px, py);
      opx = px;
      opy = py;

      teleCtx.clearRect(px+10, 0, scanBarWidth, h); 
      
      if (opx > teleCanvas.width || opx > document.getElementById("canvasesdiv").offsetWidth) {
        px = opx = 0; //-speed;
        teleCtx.clearRect(px, 0, 10, h); 
      }
      
    }
    
    isPainted = false;
    requestAnimationFrame(paint);
    document.getElementById("demoTEXT2").innerText = i;
  }

  function paint() {
    teleCtx.stroke();
    isPainted = true;
    paintCount++;
    startAnimating();
  }

  document.getElementById("demoTEXT").onkeydown = function () {
    i = 0;
    PVCflag = 1;
  };

  //window.addEventListener('resize', function(event){
    // do stuff here
    //ctx.save();
   // w = document.getElementById("demo").width = ctx.width = window.innerWidth;
    //ctx.restore();
  //});
input = document.getElementById('avgRateBox');
input.onchange = function(){setHR=input.value;HRchanged=true;};
pacerate = document.getElementById('pacingRate');
pacerate.onchange = function(){pacingRate=pacerate.value};

/*
document.getElementById("rhythmList").onchange = function() {
 
  const value = document.getElementById("rhythmList").value; 

  if (value) {
    currentRhythm=value;
  } else {
    currentRhythm='NSR';
  }
}

document.getElementById('capturing').onchange = function () 
  {
    if (document.getElementById('capturing').checked)
  {
    captureOverride=true;
  }
    else
    {
      captureOverride=false;
    }

  
}   
*/

}

// --------------------- end onLoad() ------------------------------



function drawPWave(morphOnly,width,height,invert) { // morphOnly='morphOnly' or not,   width:2x,3x etc. (integer only),  height:1.5x, 2.8xm etc, (floatOK),   invert:true or false
  if (typeof width == 'undefined') {width = 0} // 0 means normal width
  if (typeof height == 'undefined') {height = 1} // 1 means normal height
  if (typeof invert == 'undefined') {invert = 0} // 1 means normal height

  if (atrialRefractoryTimer > 100) // when atrium is depolarized, should be completely refractory for 100 ms (need to adjust?)
  {
    atrialRefractoryTimer = 0 // make atrium refractory

    // RECORD KEEPING
    if (morphOnly!='morphOnly') // not morphology only, so normal behaviour
    {
      histPTimes.push(dataClock);  // add to absolute record of all P activity
      if (histPTimes.length>10)
      {
        histPTimes.shift();
      }
      
      if (aPacerSensitivity <= aUndersenseThreshold || pacedBeatFlag) // not undersensed OR if a known paced  beat
      {
        sensedPTimes.push(dataClock); // add to record of all sensed P activity
      }
    }
    // MORPHOLOGY PORTION of draw function
    i = 0;
    var tempArray = widenWave(shortP80.slice(),width) // width 0 = normal, width 1 = double
    var ogLength = tempArray.length
    for (let j = 0; j < ogLength; j++)
    {
      if (invert==false)
      {
      dataFeed[j] = dataFeed[j]+tempArray.shift()*height; // add the voltages at each point (in case beats overlap)
      }
      if (invert==true)
      {
        dataFeed[j] = dataFeed[j]-tempArray.shift()*height; // add the voltages at each point (in case beats overlap)
      }
    }
  }
}

function QRSClick() {
  i = 0;
  var tempArray=cleanQRS.slice();
      for (let j = 0; j < cleanQRS.length; j++) 
      {
        dataFeed[j] = dataFeed[j]+tempArray.shift(); // add the voltages at each point (in case beats overlap)
      }
}

function TwaveClick() {
  i = 0;
  var tempArray=cleanT.slice();
      for (let j = 0; j < cleanT.length; j++) 
      {
        dataFeed[j] = dataFeed[j]+tempArray.shift(); // add the voltages at each point (in case beats overlap)
      }
}

var avgVentRate=0;
var oldTime=performance.now();
var histVentBeats=0;


var sensedVentTimes = [];   // each time implies a beat
var vAmplitude = 0.660; // default amplitude of R-wave
var sensedPTimes = [];   // each time implies a beat
var aAmplitude = 0.290; // default amplitude of P-wave

var aOversenseThreshold = 1.5 // threhsold below which pacer will oversense (e.g. T wave)
var aUndersenseThreshold = 10 // threshold above which pacer will undersense (e.g. won't see P wave)
                              // The sensing threshold is the least sensitive mV setting at which the temporary pacemaker can detect a heartbeat

var vOversenseThreshold = 1.5 // threhsold below which pacer will oversense (e.g. T wave)
var vUndersenseThreshold = 10 // threshold above which pacer will undersense (e.g. won't see R wave)


function drawQRST(width, invertT, invertQRS) {   // width: 0=normal, 1=double, 2=triple, etc.)  invertT: 0=upright, 1=invert)  invertQRS: 0=upright, 1=invert
  if (typeof width == 'undefined')
  {width=0;}
  if (typeof invertT == 'undefined')
  {invertT=0;}
  if (typeof invertQRS == 'undefined')
  {invertQRS=0;}

  i = 0;
  j = 0;
  if (ventRefractoryTimer > 100) // when vent is depolarized, should be completely refractory for 100 ms (need to adjust?)
  {
    ventRefractoryTimer = 0 // make ventricle refractory

    // mark event according to data clock
    histVentTimes.push(dataClock);
    if (histVentTimes.length>10)
    {
    histVentTimes.shift();
    }

    if (vPacerSensitivity <= vUndersenseThreshold || pacedBeatFlag) // not undersensing OR known paced beat-> mark real V
    {
      sensedVentTimes.push(dataClock); //mark sensed V
    }
    
    
    var tempArray=widenWave(cleanQRS,width).slice(); // widen the QRS with a factor of 1 (double the width)
    /*
    else
    {
      var tempArray=cleanQRS.slice();
    }
    */
    var ogLength = tempArray.length

    for (j = 0; j < ogLength; j++) 
    {
      if (invertQRS==0)
      {
      dataFeed[j] = dataFeed[j]+tempArray.shift(); // add the voltages at each point (in case beats overlap)
      }
      else if (invertQRS>0)
      {
        dataFeed[j] = dataFeed[j]-tempArray.shift(); // invert QRS
      }
    }
    tempArray=cleanT.slice();
    for (let i = 0; i < cleanT.length; i++) 
    {
      if (invertT==0)
      {
      dataFeed[j] = dataFeed[j]+tempArray.shift(); // add the voltages at each point (in case beats overlap)
      }
      else if (invertT>0)
      {
        dataFeed[j] = dataFeed[j]-tempArray.shift(); // invert T wave if widened QRS
      }
      j++;
    }
    
  }
}
 
var currentRhythm = "NSR";
var drawQRS=false;
var PRtimer=-1;
function masterRhythmFunction()
{
  /*
  if (document.getElementById("CHBbox").checked==true)
    {
      //currentRhythm='CHB'
      CHB=true;
      document.getElementById("CHBstuff").hidden = false;
    }
  if (document.getElementById("CHBbox").checked==false)
    {
      //currentRhythm='NSR'
    CHB=false;
    document.getElementById("CHBstuff").hidden = true;
    }
    */



    if(dataClock%100 == 0)
    {
      currentRhythm = document.getElementById("rhythmList").value
      PRInterval = parseInt(document.getElementById("PRbox").value)  // native PR interval
      setHR = document.getElementById("avgRateBox").value;
      HRadjustedPR = PRInterval - 0.5*setHR + 30;   // PR should decrease with increasing heart rates
      if (HRadjustedPR<5){HRadjustedPR=5}
      
      goalMS = (1/setHR)*60000
      adjustRatio = realtimeProcessSpeed/((1/dataHertz)*1000);
    }

  if (currentRhythm=='flatline')
  {
    if (!CHB && timeSinceLastP() >= PRInterval && drawQRS)
    {
      drawQRST();
      drawQRS=false;
    }
  }
 
if (currentRhythm=='NSR') // with this version, will incorporate a PR timer so that a V follows every P (paced or not) (unless CHB)
    {

        //let timeSinceV = timeSinceLastV();
        let timeSinceP = timeSinceLastP();
        let timeSinceV = timeSinceLastV();

        if (!CHB) // not CHB, so normal behaviour
        {
          //if (timeSinceP >= goalMS && timeSinceV >= goalMS - HRadjustedPR)   // this working 9/27
          if (timeSinceP >= goalMS && timeSinceV >= goalMS - HRadjustedPR && timeSinceLastV() > 200 )
          {
            drawPWave();
            timeSinceP=timeSinceLastP();
            if (!CHB)
            {
              drawQRS = true; // flag that QRS should come follow sinus P
            }

          }
          testClock = dataClock;
          timeSinceP=timeSinceLastP()
          timeSinceV=timeSinceLastV()

          if (timeSinceP==0 || timeSinceP == 2)
          {
            PRtimer=0; // start P-R timer (QRS should follow a P wave, whether P is intrinsic or paced)
            drawQRS=true;
          }
          if (PRtimer>=0)
          {
            PRtimer+=2;
          }
        
        // if (drawQRS && timeSinceLastV()>=goalMS && timeSinceLastP()>=HRadjustedPR && !CHB) // QRS should respond to any P's after a PR interval (unless CHB)
        if (drawQRS && PRtimer >= HRadjustedPR && !CHB && timeSinceLastV() > 150)  // !!! THIS PART CAUSING DOUBLE V-PACING -- built in minimum V-refractory 150 ms
        {
            drawQRST();
            drawQRS=false;
            PRtimer=-1; // stop PRtimer
        }
        else if (drawQRS && PRtimer >= HRadjustedPR && !CHB) // if above never runs, then clear QRS and PR timer
        {
          drawQRS=false;
          PRtimer=-1;
        }
    }
      /*
    if (CHB) // complete heart block code
        {
          let timeSinceP = timeSinceLastP()
          let timeSinceV = timeSinceLastV()
          ventHeartRate = document.getElementById("ventRateBox").value;
          atrialHeartRate = document.getElementById("atrialRateBox").value;
          let goalVentMs = 1/(ventHeartRate/60000)
          let goalAtrialMs = 1/(atrialHeartRate/60000)
          if (timeSinceLastP() >= 1/(atrialHeartRate/60000))
          {
            drawPWave();
          }
    
          if (timeSinceLastV() >= 1/(ventHeartRate/60000))
          {
            drawQRST(1,1);  //wide QRS due to idioventricular escape rhythm
          }
        }
        */
      }


    if (currentRhythm == "junctional")
    {
      // narrow QRS
      let timeSinceV = timeSinceLastV()
      ventHeartRate = document.getElementById("ventRateBox").value;
      let goalVentMs = 1/(ventHeartRate/60000)
      if (timeSinceLastV() >= 1/(ventHeartRate/60000))
      {
        drawQRST();
      }

      // if paced P appears, then QRS should follow (no block)

      if (timeSinceLastP()==0 || timeSinceLastP() == 2)
      {
        PRtimer=0; //start timer
        drawQRS=true;
      }
      if (PRtimer>=0)
      {
        PRtimer+=2;
      }

     
      if (drawQRS && PRtimer >= HRadjustedPR && !CHB && timeSinceLastSensedV() > 150)  // !!! THIS PART CAUSING DOUBLE V-PACING -- built in minimum V-refractory 150 ms
      {
          drawQRST();
          drawQRS=false;
          PRtimer=-1; // stop PRtimer
      }
      else if (drawQRS && PRtimer >= HRadjustedPR && !CHB) // if above never runs, then clear QRS and PR timer
      {
        drawQRS=false;
        PRtimer=-1;
      }
    }

    if (currentRhythm == "ventEscape")    // escape rhythm means sinus node is too slow or has stopped, but conduction still present (e.g. paced P should make a qrs)
    {
      // wide QRS (ventricular origin)
      

      let timeSinceV = timeSinceLastV()
      ventHeartRate = document.getElementById("avgRateBox").value;
      let goalVentMs = 1/(ventHeartRate/60000)
      if (timeSinceLastV() >= goalVentMs)
      {
        // *** insert wide QRS code here ***
        if (ventHeartRate<120)
        {
          drawQRST(1,1); // draw wide QRS, inverted T
        }
        else (ventHeartRate >= 120) // v-tach
        {
        drawQRST(1,0); // draw wide QRS, upright T (looks more like true V-tach)
        }
      }

      // if paced P appears, then *NARROW* QRS should follow (no block, should follow normal conduction)

      if (timeSinceLastP()==0 || timeSinceLastP() == 2)
      {
        PRtimer=0; //start timer
        drawQRS=true;
      }
      if (PRtimer>=0)
      {
        PRtimer+=2;
      }

     
      if (drawQRS && PRtimer >= HRadjustedPR && !CHB && timeSinceLastSensedV() > 150)  // !!! THIS PART CAUSING DOUBLE V-PACING -- built in minimum V-refractory 150 ms
      {
          // *** insert *NARROW* QRS code here ***
          drawQRST();
          drawQRS=false;
          PRtimer=-1; // stop PRtimer
      }
      else if (drawQRS && PRtimer >= HRadjustedPR && !CHB) // if above never runs, then clear QRS and PR timer
      {
        drawQRS=false;
        PRtimer=-1;
      }
    }
    
    //   -----------    ATRIAL FIBRILLATION ---------------
    if (currentRhythm == "aFib")    
    {
      aCaptureThreshold=10000 // pacer should never be able to capture atrium in atrial fib
      let timeSinceV = timeSinceLastV()
      var afibVarianceFactor = 1; // the smaller the more varied
      var morphoAtrialAfibRate = 800;
      var ratioSensedPs = .50  // 50% of P's will be sensed by pacemaker
      let afibPsensing = true;

      goalMS = Math.round((1/(setHR/60000))/2)*2

      if (timeSinceLastV() >= aFibMS)
      {
        drawQRST(); // this works, but maybe should allow for physiologic occasional V's capturing or being sensed
        histPTimes.push(dataClock-AVInterval); // let a P "conduct" and be sensed
          if (histPTimes.length>10)
          {
            histPTimes.shift();
          }
        random = (1-((Math.random()-0.5)/afibVarianceFactor))
        aFibMS = (goalMS)*random
      }
      if (dataClock%goalMS==0)
      {
        random = (1-((Math.random()-0.5)/afibVarianceFactor))
        aFibMS = (goalMS)*random
      }

      // throw in some sensed A's for the pacemaker to fuck with
      if (afibPsensing && aPacerSensitivity < aOversenseThreshold*2) // raise the pacer oversense threshold while in afib
      {
        let senseMS = goalMS*ratioSensedPs*random
        if (afibPSenseTimer > senseMS)
        {
          sensedPTimes.push(dataClock)
          afibPSenseTimer = 0;
        }
        afibPSenseTimer += 2;
      }

      // draw p-wave at varying rate with varying amplitude
      let morphoMSbaseline = 1/(morphoAtrialAfibRate/60000)
      if (dataClock%parseInt((morphoMSbaseline/afibRandomPtime))==0)
      {
        drawPWave('morphOnly',1,(Math.random()*1.10))
        afibRandomPtime = Math.random()/2+1
        let testMS = morphoMSbaseline/afibRandomPtime
        let testRate  = (1/testMS)*60000
        let blank = 0;

      }
      
      // noiseFlag=true;

      // document.getElementById('noise').checked=true;
    }

    if (currentRhythm != "aFlutter") {document.getElementById("flutterStuff").hidden=true;}
    if (currentRhythm == "aFlutter")    
    {
      // show flutter options on page
      document.getElementById("flutterStuff").hidden=false;
      flutterAtrialRate = document.getElementById("flutterAtrialRate").value;
      baselineFlutterConductionRatio = parseInt(document.getElementById("flutterConductionRatio").value);
      let flutterVariableAV = document.getElementById("flutterVariableAV").checked;
      let timeSinceV = timeSinceLastV()
      //goalMS = Math.round((1/(setHR/60000))/2)*2
      flutterAtrialMS = 1/(flutterAtrialRate/60000)
      flutterVentMS=flutterAtrialMS*currentFlutterConductionRatio
      
      if (timeSinceLastV() >= flutterVentMS)
      {
        drawQRST(); // this works, but maybe should allow for physiologic occasional V's capturing or being sensed
        //random = (1-((Math.random()-0.5)/afibVarianceFactor))
        let random = 0;
        if (flutterVariableAV)
        {
         random = Math.random()*flutterConductionIrregularity
        }
        currentFlutterConductionRatio = baselineFlutterConductionRatio + Math.round(random)
      }

      if (flutterAtrialTimer >= flutterAtrialMS)
      {
        drawPWave('no',1,1,false) // not morphonly, width, height, no invert
        flutterAtrialTimer=0;
      }
      flutterAtrialTimer +=2;
    }

    //  ------------------ WENKEBACH ------------------
    // Four key elements of Wenkebach rhythm 
    // (if I want to be perfectly accurate, I should incororate this stuff)
    // [ ] incorporate the principles below to make more realistic (pretty insignificant though)
    //
    // 1. Progressive lengthening of each successive PR interval.
    // 2. The pause produced by the non-conducted P wave is equal to the increment between the last PR interval (preceding the pause) and the first PR interval following the pause (shortest) subtracted from twice the PP interval.
    //    = 2(PP) - (PR4-PR1)
    // 3. The RR interval between the first and second conducted beats is the largest and between the last conducted beats, the shortest.
    // 4. There is progressive shortening of the RR intervals.

    if (currentRhythm!='2ndtypeI' || currentRhythm!='2ndtypeII') 
    {
      document.getElementById("wenckStuff").hidden=true
      //document.getElementById("CHBbox").disabled=false
    }
    if (currentRhythm=='2ndtypeI') // Wenckebach/Wenkebach
    {
        // show wenck options
        document.getElementById("wenckStuff").hidden=false
        wenkDegree = parseInt(document.getElementById("wenckeDegreeBox").value - 1) // if wenkDegree is 2, then there are 2 P waves per 1 QRS. if wenkDegree is 5, then there are 5 Ps per QRS
        // update AV block label
        document.getElementById("AVblockLabel").innerText = (wenkDegree+1).toString() + ":" + (wenkDegree).toString()
        // turn off CHB options
        //document.getElementById("CHBbox").disabled=true
        //document.getElementById("CHBbox").checked=false
        //let timeSinceV = timeSinceLastV();
        let timeSinceP = timeSinceLastP();
        let timeSinceV = timeSinceLastV();
        
        if (wenkCount == 0)
        {
          currentWenkPR = PRInterval
        }
        

          if (timeSinceP >= goalMS && timeSinceV >= goalMS - currentWenkPR && timeSinceLastV() > 200 )
          {
            if (wenkCount < wenkDegree)
              {
                currentWenkPR+=wenkPRincreaseAmount
              }
            drawPWave();
            timeSinceP=timeSinceLastP();
            if (wenkCount < wenkDegree)
            {
              drawQRS = true; // flag that QRS should come follow sinus P
              wenkCount++
            }
            else
            {
             //drawQRS=false;
             currentWenkPR = PRInterval
             wenkCount=0
            }
          }

          testClock = dataClock;
          timeSinceP=timeSinceLastP()
          timeSinceV=timeSinceLastV()

          if (timeSinceP==0 || timeSinceP == 2)
          {
            PRtimer=0; // start P-R timer (QRS should follow a P wave, whether P is intrinsic or paced)
            drawQRS=true;
          }
          if (PRtimer>=0)
          {
            PRtimer+=2;
          }
        
        // if (drawQRS && timeSinceLastV()>=goalMS && timeSinceLastP()>=HRadjustedPR && !CHB) // QRS should respond to any P's after a PR interval (unless CHB)
        if (drawQRS && PRtimer >= currentWenkPR && timeSinceLastV() > 150 && wenkCount < wenkDegree)  // !!! THIS PART CAUSING DOUBLE V-PACING -- built in minimum V-refractory 150 ms
        {
            drawQRST();
            drawQRS=false;
            PRtimer=-1; // stop PRtimer
        }
        else if (drawQRS && PRtimer >= currentWenkPR) // if above never runs, then clear QRS and PR timer
        {
          drawQRS=false;
          PRtimer=-1;
        }
        
    }

    if (currentRhythm=='highDegreeBlock') // high degree AV block (fixed ratios )

    // fixed ratio blocks (anything 3:1 or higher is "high degree")
    // 2:1 could possibly be a Wenkbach
    // rated as P:QRS degree block (e.g. 2:1, 3:1, 4:1, etc.)
    // initially presents as just occasional dropped QRS (intermittent 2:1)
    {
        // show wenck options
        document.getElementById("wenckStuff").hidden=false
        wenkDegree = parseInt(document.getElementById("wenckeDegreeBox").value)
        // update AV block label
        document.getElementById("AVblockLabel").innerText = (wenkDegree).toString() + ":" + 1
        // turn off CHB options
        //document.getElementById("CHBbox").disabled=true
        //document.getElementById("CHBbox").checked=false
        //let timeSinceV = timeSinceLastV();
        let timeSinceP = timeSinceLastP();
        let timeSinceV = timeSinceLastV();
        wenkDegree = parseInt(document.getElementById("wenckeDegreeBox").value)
        // intermittent block

        if (wenkCount == 0)
        {
          currentWenkPR = PRInterval
        }
        

          if (timeSinceP >= goalMS && timeSinceV >= goalMS - currentWenkPR && timeSinceLastV() > 200 )
          {
            drawPWave();
            timeSinceP=timeSinceLastP();
            if (wenkCount < wenkDegree)
            {
              drawQRS = true; // flag that QRS should come follow sinus P
              wenkCount++
            }
            else
            {
             //drawQRS=false;
             currentWenkPR = PRInterval
             wenkCount=0
            }

            
          }

          testClock = dataClock;
          timeSinceP=timeSinceLastP()
          timeSinceV=timeSinceLastV()

          if (timeSinceP==0 || timeSinceP == 2)
          {
            PRtimer=0; // start P-R timer (QRS should follow a P wave, whether P is intrinsic or paced)
            drawQRS=true;
          }
          if (PRtimer>=0)
          {
            PRtimer+=2;
          }
        
        // if (drawQRS && timeSinceLastV()>=goalMS && timeSinceLastP()>=HRadjustedPR && !CHB) // QRS should respond to any P's after a PR interval (unless CHB)
        if (drawQRS && PRtimer >= currentWenkPR && timeSinceLastV() > 150 && wenkCount == wenkDegree)  // !!! THIS PART CAUSING DOUBLE V-PACING -- built in minimum V-refractory 150 ms
        {
          
            drawQRST();
            drawQRS=false;
            PRtimer=-1; // stop PRtimer
            wenkCount=0
        }
        else if (drawQRS && PRtimer >= currentWenkPR) // if above never runs, then clear QRS and PR timer
        {
          drawQRS=false;
          PRtimer=-1;
        }
        
    }

    if (currentRhythm!='intermAVBlock')
    {
      document.getElementById("intermAVBlockStuff").hidden=true
    }
    if (currentRhythm=='intermAVBlock') // Mobitz II

    // 1 or more sequential P waves do not conduct
    // rated as P:QRS degree block (e.g. 2:1, 3:1, 4:1, etc.)
    // initially presents as just occasional dropped QRS (intermittent 2:1)
    {
        // show intermittent block options
        document.getElementById("intermAVBlockStuff").hidden=false
        ratioBlockedPs = parseFloat(document.getElementById("blockFreqBox").value)
        document.getElementById("blockedRatioLabel").innerText = (ratioBlockedPs*100).toString() + "% blocked P's"
        // turn off CHB options
        //document.getElementById("CHBbox").disabled=true
        //document.getElementById("CHBbox").checked=false
        
  //let timeSinceV = timeSinceLastV();
  let timeSinceP = timeSinceLastP();
  let timeSinceV = timeSinceLastV();

  
    //if (timeSinceP >= goalMS && timeSinceV >= goalMS - HRadjustedPR)   // this working 9/27
    if (timeSinceP >= goalMS && timeSinceV >= goalMS - HRadjustedPR && timeSinceLastV() > 200 )
    {
      drawPWave();
      timeSinceP=timeSinceLastP();
      drawQRS = true; // flag that QRS should come follow sinus P
      if (lastBlocked) // if last P was blocked
      {
        AVBlockRandom = 1 // force next P to conduct
        lastBlocked = false
      }
      else // if it wasn't blocked, keep generating new
      {
      AVBlockRandom = Math.random();
      }

    }
    testClock = dataClock;
    timeSinceP=timeSinceLastP()
    timeSinceV=timeSinceLastV()

    if (timeSinceP==0 || timeSinceP == 2)
    {
      PRtimer=0; // start P-R timer (QRS should follow a P wave, whether P is intrinsic or paced)
      drawQRS=true;
    }
    if (PRtimer>=0)
    {
      PRtimer+=2;
    }
  
    // if (drawQRS && timeSinceLastV()>=goalMS && timeSinceLastP()>=HRadjustedPR && !CHB) // QRS should respond to any P's after a PR interval (unless CHB)
    if (drawQRS && PRtimer >= HRadjustedPR && !CHB && timeSinceLastV() > 150)  // !!! THIS PART CAUSING DOUBLE V-PACING -- built in minimum V-refractory 150 ms
    {
      if (AVBlockRandom > ratioBlockedPs) // 20% of time, drop a QRS
      {
      drawQRST();
      drawQRS=false;
      lastBlocked=false
      }
      else
      {
        lastBlocked=true
      }
      
        PRtimer=-1; // stop PRtimer
    }
    else if (drawQRS && PRtimer >= HRadjustedPR && !CHB) // if above never runs, then clear QRS and PR timer
    {
      drawQRS=false;
      PRtimer=-1;
    }
  }

  if (currentRhythm!="copmleteBlock")
  {
    document.getElementById("CHBstuff").hidden=true;
    CHB=false;
  }
  if (currentRhythm=="completeBlock") // complete heart block
  {
    let timeSinceP = timeSinceLastP()
    let timeSinceV = timeSinceLastV()
   // document.getElementById("CHBbox").checked = true;
    
    
  //  CHB = true;
    document.getElementById("CHBstuff").hidden=false;
    ventHeartRate = document.getElementById("ventRateBox").value;
    atrialHeartRate = document.getElementById("atrialRateBox").value;
    let goalVentMs = 1/(ventHeartRate/60000)
    let goalAtrialMs = 1/(atrialHeartRate/60000)
    if (timeSinceLastP() >= goalAtrialMs)
    {
      drawPWave();
    }

    if (timeSinceLastV() >= goalVentMs)
    {
      drawQRST(1,1);  //wide QRS due to idioventricular escape rhythm
    }
  }

  if (currentRhythm!='geminies')
  {
    document.getElementById("geminiStuff").hidden=true
  }
  if (currentRhythm=='geminies') // bigeminy, trigeminy, of PVCs
    {
        let timeSinceP = timeSinceLastP();
        let timeSinceV = timeSinceLastV();     
      document.getElementById("geminiStuff").hidden=false
        
        geminyRatio = parseInt(document.getElementById("geminiRatioBox").value)

          if (timeSinceP >= goalMS && timeSinceV >= goalMS - HRadjustedPR && timeSinceLastV() > 200 && geminyCount<geminyRatio && PPtimer%goalMS==0)
          {
            drawPWave();
            PPtimer = 0
            timeSinceP=timeSinceLastP();
      
            drawNormalQRS = true; // flag that QRS should come follow sinus P
            PVCtimer = 0
             //drawNormalQRS=false;
          }

          if (geminyCount==geminyRatio && PVCtimer > goalMS/1.5)
          {
            drawQRST(1,1) // wide QRS, inverted T (a PVC)
            PVCtimer=0
            geminyCount = 0
          }

          if (geminyCount>geminyRatio)
          {
            PVCtimer = -1 // disable timer
            geminyCount = 0
          }

          if (PVCtimer >= 0)
          {
            PVCtimer += 2 // increment timer
          }

          if (PPtimer >= 0)
          {
            PPtimer += 2
          }

          testClock = dataClock;
          timeSinceP=timeSinceLastP()
          timeSinceV=timeSinceLastV()

          if (timeSinceP==0 || timeSinceP == 2)
          {
            PRtimer=0; // start P-R timer (QRS should follow a P wave, whether P is intrinsic or paced)
            drawNormalQRS=true;
          }
          if (PRtimer>=0)
          {
            PRtimer+=2;
          }
        
        // QRS should respond to any P's (intrinsic or paced) after a PR interval
        if (drawNormalQRS && PRtimer >= HRadjustedPR && timeSinceLastV() > 150)
        {
          
            drawQRST();
            drawNormalQRS=false;
            PRtimer=-1; // stop PRtimer
            geminyCount++
        }
        else if (drawNormalQRS && PRtimer >= HRadjustedPR) // if above never runs, then clear QRS and PR timer
        {
          drawNormalQRS=false;
          PRtimer=-1;
        }
/*
        if (timeSinceV>goalMS+HRadjustedPR+30)  // backup reset
        {
          geminyCount = 0
        }
        */
    }


}



var currentRhythmID = [0,0];
function NSRhythm() 
{
  PRInterval = parseInt(document.getElementById("PRbox").value)
	clearRhythms();
  currentRhythm = 'NSR';
  CHB = false;
  //document.getElementById("CHBbox").checked = false;
  document.getElementById("CHBstuff").hidden = true;
	setHR = document.getElementById("avgRateBox").value;

  goalMS = (1/setHR)*60000

}
/*
function ECGsyn() {
  clearRhythms();
	dataFeed=synthECG.slice();
  
}
*/
function showCHB() {
  document.getElementById("CHBbox").checked = true;
  clearRhythms();
  currentRhythm = 'CHB';
  CHB = true;
  document.getElementById("CHBstuff").hidden=false;
  ventHeartRate = document.getElementById("ventRateBox").value;
  atrialHeartRate = document.getElementById("atrialRateBox").value;
  // setHR = document.getElementById("avgRateBox").value = ventHeartRate;

  /*
  currentRhythmID.push(setInterval(function ()
    {
      QRST();
    },(1/(ventHeartRate/60))*1000))

    currentRhythmID.push(setInterval(function ()
  {
    drawPWave();
  },(1/(atrialHeartRate/60))*1050));
  */

}

function clearRhythms()
{
  currentRhythm='flatline';
  dataFeed = [0];
  dataFeed.length = 1000;
  dataFeed.fill(0,0,1000);
  currentRhythmID.forEach((element) => 
  {
    clearInterval(element);
  });
  currentRhythmID = [];
}

var currentHeartRate=0;

function paintHR() {

  HRctx.font = "50px Arial";
  HRctx.fillStyle = "#00bd00";
  HRctx.lineWidth = 3;
  HRctx.clearRect(0,0,HRCanvas.width,HRCanvas.height); //clears previous HR 
  // rolling average (weighted)
  // histVentTimes contains absolute timestamps of V beats  
  // weighted average - weight more recent measurements

  let weightedSum=0;
  let weightCount=0;
  for (let i = 0; i < histVentTimes.length; i++) {
    let elapsed = histVentTimes[i]- histVentTimes[i-1];
    if (isNaN(elapsed)) {
      elapsed=0;
    }
    let elapsedWt = elapsed*i
    weightedSum=weightedSum+elapsedWt;
    weightCount = weightCount+i;
  }

  // take into account current wait (time since last beat)
  let currentElapsed = dataClock-histVentTimes.at(-1);
  let weightedAverageElapsed;
  let weightedAverageHR;
  // if currentElapsed > histVentTimes.at(-1) - histVentTimes.at(-2)
  if (currentElapsed > histVentTimes.at(-1) - histVentTimes.at(-2))
    {
    weightedAverageElapsed = currentElapsed;
    histVentTimes.splice(0,histVentTimes.length-2);
    weightedAverageHR = 1/(weightedAverageElapsed/60000);
    }
    else
    {
      weightedAverageElapsed = (weightedSum)/(weightCount);
      weightedAverageHR = 1/(weightedAverageElapsed/60000);
    }

    let weightedAverageMS = weightedSum/weightCount;
    weightedAverageHR = 1/(weightedAverageMS/60000);

  if(isNaN(weightedAverageHR))
    {weightedAverageHR = null;}
   // currentHeartRate=Math.round(weightedAverageHR*(processingSpeed/dataHertz));  // depends on realtime browser time measurements
      currentHeartRate=Math.ceil(weightedAverageHR); // unaffected by realtime browser time measurements
  
    if (teleCanvas.width < document.getElementById("canvasesdiv").offsetWidth)
      {
      HRctx.fillText("HR: "+currentHeartRate, teleCanvas.width-200, 50); //actual paint command
      }
    else
      {
        HRctx.fillText("HR: "+currentHeartRate, document.getElementById("canvasesdiv").offsetWidth-190, 50); //actual paint command
      }
  }
paintHR();
setInterval(paintHR,1000);

function drawPacingSpike() {
  teleCtx.fillStyle = 'white';
  teleCtx.fillRect(px,py,2,-75)
  teleCtx.fillStyle = "#00bd00";
  paceSpike=false;
}

/*
// ----------- PACEMAKER ABSTRACTION -------------
// I.   Controls          
// II.  Display on Feed   
// III. Logic             
// IV.  Pretty GUI        

// ----- LOGIC -----
//  I.  MODE (AAI,VVI,etc.)
//    a. SENSING
//    b. PACING
//    c. RESPONSE (pace,inhibit) - will just work on inhibit for now
//    d. RATE CONTROL   - only if I'm really wanting to hurt myself
//
//  II. SENSING
//      - should be able to 'sense' user-set threshold (e.g. 5 mV)
//      - if undersensing:  will pace asynchrohnously regardless of underlying rhythm
//      - if oversensing:   will not pace at all
//           - crosstalk = leads in different chambers interact (e.g. A-lead interprets V-pace stimulus as a native P wave)
//           - T-wave = T is sensed as an R wave
//      - user should modify sensing threshold to cause appropriate pacing
//  III.  CAPTURE
//      - pacing spike should initiate a P wave or a QRS wave (depending if A or V lead)
//      - there is an arbitrary pacing threshold, where if not met, capture doens't occur
//      - failure to capture happens if output voltage is too low, or leads are off/corrupt
//      - user should increase voltage until capture occurs

// ------------- TO DO -------------
// [X] pacing capture algorithm
//    [x] pacing spike should inhibit if intrinsic P's or V's present (if paced rate exceeds intrinsic)    
// [ ] pacing controls
//    [x] rate
//    [x] AAI, VVI, DDI (dropdown box?)
//    [ ]
*/

const atrium = "atrium";
const vent = "vent";

function paceIt(target) // target : atrium = 1, vent = 2
{
  pacedBeatFlag=true;
  if (pacerCapturing(target))
  {
    drawPacingSpike();  // draw pacing spike
    if (target==atrium)
      {
        drawPWave();
      }
      else if (target==vent)
      {
        drawQRST(1,0,1); // wide QRS, upright T, invert QRS
      }
  }
  else // if not capturing
  {
    drawPacingSpike();
    if (target==atrium)
      {
        sensedPTimes.push(dataClock)
      }
      else if (target==vent)
      {
        sensedVentTimes.push(dataClock)
      }
    
  }

pacedBeatFlag=false;
}

function paceButtonClick() {
  let paceButton = document.getElementById("paceButton");
  if (paceButton.innerText == "Start Pacing")
  {
    startPacing();
    paceButton.innerText = "Stop Pacing";
  }
  else
  {
    stopPacing();
    paceButton.innerText = "Start Pacing";
  }
}
var aPacerInterval;
var vPacerInterval;
var pacerInterval;
var pacerOn = false;
var pacingRate = 60;
var atrialRefactoryPeriod = 0;
var ventBlankingPeriod = 0;
function startPacing() {
	
	pacingRate = document.getElementById("pacingRate").value;
  
  pacerOn = true;  
}

function pacingModeBoxChange()
{
  let element = document.getElementById("pacingMode")
  if (element.options[element.selectedIndex].text == "DDD")
  {
    document.getElementById("URLdiv").hidden=false
  }
  if (element.options[element.selectedIndex].text != "DDD")
  {
    document.getElementById("URLdiv").hidden=true
  }
}

var AVInterval = 120; // pacemaker interval between atrial and v pace
let captureOverride = false;
var sensing = 0; // 0: sensing appropriate, -1: undersensing, +1: oversensing


function pacingFunction()
{
  AVInterval = document.getElementById("AVInterval").value; // delay between atrial and vent pace
  
  let timeSinceP = timeSinceLastSensedP();
  let timeSinceV = timeSinceLastSensedV();
  let goalPacerMs = Math.round(((1/pacingRate)*60000)/2)*2; // goal how many ms between R waves
  let element = document.getElementById("pacingMode")
  pacerMode = element.options[element.selectedIndex].text;
  
 
    // AAI (A pace, A sense (ignore V) )

    if (pacerMode=='AAI')
    {
      if (timeSinceLastSensedP() > goalPacerMs) // has it been long enough since last P?
      {
        
        if (aPacerSensitivity >= aOversenseThreshold) // is pacer not oversensing?
        {
          if (atrialRefactoryPeriod <= 0) // if pacer fires, should have a 'refractory period' where it will not pace again
          {
            if (pacerCapturing(atrium)) // is output high enough?
            {
              if (!CHB) // is conduction intact?
              {
                drawQRS = true; // signal that QRS should be drawn next
              }
            paceIt(atrium);
            }
            else if (!pacerCapturing(atrium)) // if not capturing, just draw a pacing spike and do nothing else
            {
              drawPacingSpike();
            }
            atrialRefactoryPeriod = goalPacerMs; // with capture or not, start pacertimeout
          }
     
    }
  }
    if (atrialRefactoryPeriod>0)  // augment pacer timer if running
    {
      atrialRefactoryPeriod -= 2;
    }
  }
    // VVI (V pace only, V sense, ignore A completely)
    // Figure 6.3. The VVI timing cycle consists of a defined LRL and a VRP (shaded triangles).
    // When the LRL timer is complete, a pacing artifact is delivered in the absence of a sensed
    // intrinsic ventricular event. If an intrinsic QRS occurs, the LRL timer is started from that
    // point. A VRP begins with any sensed or paced ventricular activity   
    
    if (pacerMode == 'VVI')
    {
      if (timeSinceLastSensedV() > goalPacerMs)
      {
        
        if (vPacerSensitivity >= vOversenseThreshold) // is pacer not oversensing?
        {
    
          if (ventBlankingPeriod <= 0) // if pacer fires, should have a timeout period
          {
            if (pacerCapturing(vent))
            {
            paceIt(vent);
            PRtimer=-1; // stop PRtimer
            }
            else if (!pacerCapturing(vent)) // if not capturing, just draw a pacing spike and do nothing else
            {
              drawPacingSpike();
            }
            ventBlankingPeriod = goalPacerMs; // with capture or not, start pacertimeout
          }
    }
  }
    if (ventBlankingPeriod>0)  // augment pacer timer if running
    {
      ventBlankingPeriod -= 2;
    }
  }
            
    // DDI (pace A and V; don't track A)
    // DDD vs DDI
    // DDD: can track the atrium and pace ventricle accordingly (not good for tachyarrhythmias)
    //      so if senses intrinsic P -> paces V at intrinsic P rate ("atrial tracking")
    // DDI: only inhibits (so senses P -> inhibits P; senses V -> inhibits V)
    // "atrial tracking: ON" means DDD. "atrial tracking: OFF" means DDI.
    //
    // DDI is like combining AAI and VVI modes
    // 
    // -- FROM THE MANUAL --
    // 
    // if no intrinsic P, pace V after V-A interval which is equal to the programmed base RATE minus the programmed A-V INTERVAL. 
    // if no intrinsic V, pace V after programmed A-V interval
    // if no paced P, no AV synchrony, and V only paces if R-waves less than set rate

    // When A. Tracking is off (DDI pacing mode), an atrial sense will inhibit an atrial pace, but it
    // does not trigger an A-V Interval (see Figure 45). The ventricle is paced at the selected
    // RATE.

    // from another website
    // -----------------
    // The DDI pacing mode uses a ventricular timing base. It breaks the pacing interval 
    // into two parts: the atrial pacing interval and the ventricular pacing interval, which are spaced by the 
    // atrioventricular delay. For example, if the basic rate is set to 60 and the AV delay to 200 ms, 
    // the atrial pacing interval VA is equal to 1 000 ms - 200 ms = 800 ms, 
    // the ventricular pacing VV interval is equal to 1000 ms.
    // If no spontaneous activity is sensed, it paces the atria and ventricles at the basic rate or 
    // sensor indicated rate, respecting the programmed AV delay (first 2 cycles). If atrial activity is sensed, 
    // it inhibits atrial pacing, without changing the ventricular pacing rate (cycles 3, 4 and 5). 
    // If spontaneous activity is sensed in the ventricle, it inhibits both stimuli (subsequent cycles).


  if (pacerMode == 'DDI')  // sensing fixed
  {
    var autoAV = AVIntervalHRAdjustBox.checked;
    let HRadjustedAV = Math.round((300 - (1.67 * pacingRate))/2)*2
    var usedAVinterval = HRadjustedAV
    if (HRadjustedAV < 50) {HRadjustedAV = 50}
    if (HRadjustedAV > 150) {HRadjustedAV = 150}

    if (autoAV)
    {
      usedAVinterval = HRadjustedAV // auto AV 
    }
    else
    {
      usedAVinterval = AVInterval // use whatever is in the box
    }
    var debug = timeSinceLastSensedV()
    if (timeSinceLastSensedV() == 2)
    {
      VAItimer=goalPacerMs - usedAVinterval
      VVtimer=goalPacerMs
      VAITimerFlag=true;
    }

    if (timeSinceLastSensedP() == 2)
    {
      AAtimer=goalPacerMs
      VAITimerFlag=false;
    }

    if (VVtimer == 0)
    {
      paceIt(vent);
        
      VVtimer = goalPacerMs
      VAItimer = goalPacerMs - usedAVinterval
    }

    if (VAItimer==0)
    {
      
        paceIt(atrium);
       
      VAITimerFlag=false;
      VAItimer=goalPacerMs-usedAVinterval
    }

     // tick the timers down
     if (AVITimerFlag)
     {
       AVITimer -= 2; 
     }
     if (VAITimerFlag)
     {
       VAItimer -= 2;
     }
     VVtimer -= 2;
}


  // DDD (pace A and V; track A (if native A rate > pacer rate, pace V at native A rate))
    // DDD vs DDI
    // DDD: can track the atrium and pace ventricle accordingly (not good for tachyarrhythmias)
    //      so if senses intrinsic P -> paces V at intrinsic P rate ("atrial tracking")
    // DDI: only inhibits (so senses P -> inhibits P; senses V -> inhibits V)
    // "atrial tracking: ON" means DDD. "atrial tracking: OFF" means DDI.
    //
    // -- FROM THE MANUAL --
    // 
    // if no intrinsic P, pace V after V-A interval which is equal to the programmed base RATE minus the programmed A-V INTERVAL. 
    // if no intrinsic V, pace V after programmed A-V interval
    //
    // 5.3.3 A. Tracking
    // A. Tracking (atrial tracking) is only accessible or applicable when the temporary pacemaker
    // is set to sense and pace in both chambers. When A. Tracking is turned On, the temporary
    // pacemaker paces the ventricle in synchrony with intrinsic atrial depolarizations.
    //
    // When A. Tracking is turned on (DDD pacing mode), each sensed event on the atrial lead not
    // only inhibits the scheduled atrial pacing pulse, but also triggers an A-V Interval.
    // Warning: If a patient is prone to atrial arrhythmias, atrial tracking could lead to the
    // development of ventricular arrhythmias (see Section 1.5).
    //
    // When A. Tracking is off (DDI pacing mode), an atrial sense will inhibit an atrial pace, but it
    // does not trigger an A-V Interval (see Figure 45). The ventricle is paced at the selected
    // RATE.

    // ---------- DDD TIMING CYCLE ------------
    // The timing cycle in DDD consists of an LRL, an AVI, a VRP, a PVARP, and a URL. There are four variations 
    // of the DDD timing cycle. If intrinsic atrial and ventricular activity occur before the LRL times out, 
    // both channels are inhibited and no pacing occurs (first panel). 
    // 
    // If a P wave is sensed before the VAI is 
    // completed (the LRL minus the AVI), output from the atrial channel is inhibited. The AVI is initiated, 
    // and if no ventricular activity is sensed before the AVI terminates, a ventricular pacing artifact is delivered, 
    // that is, P-synchronous pacing (second panel). 
    //
    // If no atrial activity is sensed before the VAI is completed, 
    // an atrial pacing artifact is delivered, which initiates the AVI. 
    // If intrinsic ventricular activity occurs before the termination of the AVI, ventricular output from the pacemaker is inhibited, that is, 
    // atrial pacing (third panel). 
    // 
    // If no intrinsic ventricular activity occurs before the termination of the AVI, 
    // a ventricular pacing artifact is delivered, that is, AV sequential pacing (fourth panel).
    //
    // The basic timing circuit associated with LRL DDD pacing is divided into two sections.The first is the interval 
    // from a ventricular sensed or paced event to an atrial paced event and is known as the AEI, or VAI. 
    // The second interval begins with an atrial sensed or paced event and extends to a ventricular event. 
    // This interval may be defined by a paced AV, PR, AR, or PV interval.
    //
    // var lowerRateLimit // the rate of the pacemaker in ms
    // var AVI // the set interval between a sensed/paced A and associated V (artificial PR interval)
    // var VRP // prevent ventricular sensing of immediate post-V noise (OPTIONAL)
    // var PVARP // prevent atrial sensing of immediate post-V noise (OPTIONAL)
    // var upperRateLimit //prevent atrial tracking of atrial tachyarrythmias (OPTIONAL)
    //
    // LRL = VAI + AVI
    // 
    // If there is intact conduction through the AV node after an atrial pacing stimulus such that the AR interval
    // (atrial stimulus to sensed R wave) is shorter than the programmed AVI, the resulting paced rate accelerates 
    // by a small amount. This response is demonstrated in Figure 6.12 (top).
    //
    // The addition of an RRAVD to a ventricular-based timing system minimizes the increase in the 
    // paced atrial rate above the programmed sensor-indicated rate.
    //
    // Another option is extending the VAI as needed to control the AA pacing rate according to the programmed MSR 
    // (Fig. 6.44). This extension results in adaptive-rate pacing, regardless of AV conduction status, which is 
    // equal to, but does not exceed, the desired MSR.
    //  -- Basically, extend the VA interval based on sensed AR interval to ensure R-R equals goalMS

    if (pacerMode == 'DDD') // sensing fixed
    {
      // vars
      timeSinceV=timeSinceLastSensedV();
      timeSinceP=timeSinceLastSensedP();
      maxTrackingRate = document.getElementById('URLbox').value;
      var autoAV = AVIntervalHRAdjustBox.checked;
      let lowerRateLimit = VAItimer + AVInterval
      let VAinterval = goalPacerMs - AVInterval
      let HRadjustedAV = 300 - (1.67 * pacingRate)
      var usedAVinterval = HRadjustedAV
      if (HRadjustedAV < 50) {HRadjustedAV = 50}
      if (HRadjustedAV > 150) {HRadjustedAV = 150}

      if (autoAV)
      {
        usedAVinterval = HRadjustedAV // auto AV 
      }
      else
      {
        usedAVinterval = AVInterval // use whatever is in the box
      }

      // once pacer is turned on, timers should start immediately regardless of sensing or anything else
      

      if (timeSinceLastSensedV() == 2) // The first is the interval from a ventricular sensed or paced event to an atrial paced event and is known as the AEI, or VAI.
      {
        VVtimer = 0;
        rOLD = rNEW
        rNEW = dataClock
        if (autoAV)
        {
        VAItimer = goalPacerMs - usedAVinterval + AVExtension // start the VAI/AEI timer (interval from vent to next P)
        // AVExtension attempts to modify the VAI interval with goal of more closely achieving goal heart rate
        }
        else
        {
        VAItimer = goalPacerMs - usedAVinterval // start the VAI/AEI timer (interval from vent to next P)
        }
        AVITimer = usedAVinterval; // set timers
        VAITimerFlag = true;  // turn on V-A timer
        AVITimerFlag = false; // turn off A-V timer
      }
      if (goalPacerMs - (rNEW - rOLD) > 0 && goalPacerMs - (rNEW - rOLD) <= usedAVinterval)
      {
      AVExtension = goalPacerMs - (rNEW - rOLD) // how far off was last effect pacing rate from goal rate?
      }
      else {AVExtension = 0}
      
      timeSinceP = timeSinceLastSensedP()
      if (timeSinceLastSensedP() == 2)  // The second interval begins with an atrial sensed or paced event and extends to a ventricular event. This interval may be defined by a paced AV, PR, AR, or PV interval.
      {
        //VAItimer = goalPacerMs - AVInterval // start the VAI/AEI timer (interval from vent to next P)
        AVITimer = usedAVinterval // set timers
        VAITimerFlag = false; // turn off V-A timer
        AVITimerFlag = true; // turn on A-V timer
        
      }


      if (VAItimer <= 0 && VAITimerFlag)  // if vent to atri timer runs out, pace atrium
      {
        //if (pacerCapturing(atrium))
        //{
        
        paceIt(atrium);
        //}
        /*
        else if (!pacerCapturing(atrium)) // if not capturing, just draw a pacing spike and do nothing else
        {
          drawPacingSpike();
        }
        */
        VAITimerFlag = false; // turn off the VA timer
      }
      // backup reset timers if timers fail for some reason (undersensing?)
      if (timeSinceLastSensedP() > goalPacerMs+50)    // backup to pace P if timers fail
      {
        VAITimerFlag=true
      }
      

      // ventricular pacing (after timers expire)
      //if ((AVITimer <= 0 && AVITimerFlag) || VVtimer >= goalPacerMs) // if atrium-to-vent timer runs out, pace vent (VVtimer shouldn't be necessary?)
      var maxTrackingMS = 1/(maxTrackingRate/60000)
      if ((AVITimer <= 0 && AVITimerFlag && VVtimer > maxTrackingMS)) // if atrium-to-vent timer runs out, pace vent
      {
        //if (pacerCapturing(vent))
        //{
        paceIt(vent);
        //}
        /*
        else if (!pacerCapturing(vent)) // if not capturing, just draw a pacing spike and do nothing else
        {
          drawPacingSpike();
        }
        */
        AVITimerFlag=false; // turn off the AV timer
      }
        // tick the timers down
        if (AVITimerFlag)
        {
          AVITimer -= 2; 
        }
        if (VAITimerFlag)
        {
          VAItimer -= 2;
        }
        VVtimer+=2;
      
  }



  // AOO (asynchronous A pacing = no sensing)

  if (pacerMode=='AOO')
  {
    
    
    if (AAtimer == 0) // when AAtimer runs out, pace
    {
      
          if (pacerCapturing(atrium)) // is output high enough?
          {
            if (!CHB) // is conduction intact?
            {
              drawQRS = true; // signal that QRS should be drawn next
            }
          paceIt(atrium);
          AAtimer=goalPacerMs;
          }
          else if (!pacerCapturing(atrium)) // if not capturing, just draw a pacing spike and do nothing else
          {
            drawPacingSpike();
          }
    }
    if (AAtimer<0)
    {
      AAtimer=goalPacerMs;
    }
    AAtimer -= 2; // run timer
   
  }

 // VOO (asynchronous V pacing = no sensing)
  
  if (pacerMode == 'VOO')
  {
    if (VVtimer == 0 || VVtimer == 1) // when VVtimer runs out, pace
    {
          if (pacerCapturing(vent))
          {
          paceIt(vent);
          }
          else if (!pacerCapturing(vent)) // if not capturing, just draw a pacing spike and do nothing else
          {
            drawPacingSpike();
          }
          VVtimer=goalPacerMs
    }
    if (VVtimer<0)
    {
      VVtimer=goalPacerMs
    }
    VVtimer-=2;
  }

    // DOO (asynchronous A and V pacing; no sensing)
    // A timer drives, followed by AV timer and V pace
    if (pacerMode=='DOO')
    {
           
      if (AAtimer == 0) // when AAtimer runs out, pace
      {
            if (pacerCapturing(atrium)) // is output high enough?
            {
            paceIt(atrium);
            AAtimer=goalPacerMs;
            }
            else if (!pacerCapturing(atrium)) // if not capturing, just draw a pacing spike and do nothing else
            {
              drawPacingSpike();
            }
            AVtimer=AVInterval
      }
      if (AAtimer<0)
      {
        AAtimer=goalPacerMs;
      }
      AAtimer -= 2; // run timer
     
      // vent logic; pace V after AV timer runs out
      if (AVtimer == 0 || AVtimer == 1) // when VVtimer runs out, pace
    {
          if (pacerCapturing(vent))
          {
          paceIt(vent);
          }
          else if (!pacerCapturing(vent)) // if not capturing, just draw a pacing spike and do nothing else
          {
            drawPacingSpike();
          }
          AVtimer=goalPacerMs
    }

    AVtimer-=2;
    
  }
  if (pacingFeedback) // is learning feedback mode enabled?
  {
    if (dataClock%100 == 0)
    {
      feedbackFunction();
    }
  }

}
var AVITimerFlag=false;
var VAITimerFlag=false;


var pacerMode = 'DDD';
var pacedFlag=false;

function stopPacing() {
  pacerOn=false;
}


function timeSinceLastP() {
  if (isNaN(histPTimes.at(-1))) {return 100000;}
  //let timeee = (dataClock - histPTimes.at(-1))*(processingSpeed/dataHertz);
  let timeee = (dataClock - histPTimes.at(-1));
  timeSincePGlobal=timeee;
  return timeee;
}

function timeSinceLastSensedP() {
  if (isNaN(sensedPTimes.at(-1))) {return 100000;}
  //let timeee = (dataClock - histPTimes.at(-1))*(processingSpeed/dataHertz);
  let timeee = (dataClock - sensedPTimes.at(-1));
  timeSinceSensedPGlobal=timeee;
  return timeee;
}

function timeSinceLastV() {
  if (isNaN(histVentTimes.at(-1))) {return 100000;}
  //let timeee = (dataClock - histVentTimes.at(-1))*(processingSpeed/dataHertz);
  let timeee = (dataClock - histVentTimes.at(-1));
  timeSinceVGlobal=timeee;
  return timeee ;
}

function timeSinceLastSensedV() {
  if (isNaN(sensedVentTimes.at(-1))) {return 100000;}
  //let timeee = (dataClock - histVentTimes.at(-1))*(processingSpeed/dataHertz);
  let timeee = (dataClock - sensedVentTimes.at(-1));
  timeSinceSensedVGlobal=timeee;
  return timeee;
}

function windowSizeChange() {
  // run code to match canvas to current window size
  // should probably change both canvas sizes (canvas, canvas1), clear both canvases, realign drawing point to left side of screen, and move HR indicator

  //canvas.width = window.innerWidth;
  HRCanvas.width = window.innerWidth;
  //ctx.width = window.innerWidth;
  //ctx1.width = window.innerWidth;
  //px = opx = 0;
  teleCtx.clearRect(px, 0, scanBarWidth, h); 
  paintHR();
  //ctx1.clearRect(0,0,canvas1.width,canvas1.height); //clears previous HR 
  drawPacemaker();

}

window.addEventListener('resize',windowSizeChange);

function pacerCapturing(chamber) {
  if (captureOverride)
  {return true;}
  else
  {
    if (chamber == atrium && aPacerOutput >= aCaptureThreshold)
    {
      return true;
    }
    if (chamber == vent && vPacerOutput >= vCaptureThreshold)
    {
      return true;
    }
    else {return false;}
  } 
}

function onOutputChange(chamber) {
  if (chamber == "atrium")
  {
    aPacerOutput = document.getElementById("aOutputBox").value;
  }
  if (chamber == "ventricle")
  {
    vPacerOutput = document.getElementById("vOutputBox").value;
  }
}

function onSensitivityChange() {
 
    aPacerSensitivity = document.getElementById("aSensitivityBox").value;
    vPacerSensitivity = document.getElementById("vSensitivityBox").value;
}

function clickCHB() {
  if (document.getElementById("CHBbox").checked)
  {
    CHB=true;
    document.getElementById("CHBstuff").hidden=false;
    ventHeartRate = document.getElementById("ventRateBox").value;
    atrialHeartRate = document.getElementById("atrialRateBox").value;
  }
  else
  {
    CHB=false;
    document.getElementById("CHBstuff").hidden=true;
    ventHeartRate = document.getElementById("ventRateBox").value;
    atrialHeartRate = document.getElementById("atrialRateBox").value;
  }
}

function randomizeThresholds() // randomize a bit capture, oversense, undersense thresholds
{
  // capture thresholds (default A=2, V=5)
  vCaptureThreshold = 5 + (Math.random() - 0.5)*2 //      +/- 1
  aCaptureThreshold = 2 + (Math.random() - 0.5)*2 //      +/- 1

  // sensitivity Thresholds (default A=1.5, 10   and V=1.5, 10)
  aOversenseThreshold = 1.5 + (Math.random() - 0.5)*2 //      +/- 1
  aUndersenseThreshold = 10 + (Math.random() - 0.5)*2 //      +/- 1
  vOversenseThreshold = 1.5 + (Math.random() - 0.5)*2 //      +/- 1
  vUndersenseThreshold = 10 + (Math.random() - 0.5)*2 //      +/- 1
  
}


// ------- PACEMAKER CANVAS ---------
var pacemakerCanvas = document.getElementById("pacemakerCanvas");
var pacemakerHeight = pacemakerCanvas.height = document.getElementById("pacemakerDiv").offsetHeight
var pacemakerWidth = pacemakerCanvas.width = document.getElementById("pacemakerDiv").offsetWidth

var pacemakerCtx = pacemakerCanvas.getContext("2d");
var pacemakerImg = new Image();
pacemakerImg.src = "https://sevenlayercookie.github.io/pacemaker-sim/assets/pacemaker.svg";
pacemakerImg.onload = function() {
  drawPacemaker()
};

function drawPacemaker()
{
  pacemakerHeight = pacemakerCanvas.height = document.getElementById("pacemakerDiv").offsetHeight
  pacemakerWidth = pacemakerCanvas.width = document.getElementById("pacemakerDiv").offsetWidth
  pacemakerCtx.drawImage(pacemakerImg,0,0);
}

function noiseToggle()
{noiseFlag=!noiseFlag}

function noiseFunction()
{
  //dataFeed[0] = dataFeed[0]*1.05 // 5% wander
  if (dataClock%20==0)
  {
  dataFeed[0] = dataFeed[0]+(Math.random()-0.5)/5
  }
}

function feedbackFunction() // provides feedback on settings
{
  if (currentRhythm != 'aFib' && currentRhythm != 'aFlutter')
  {
    if (aPacerSensitivity < aUndersenseThreshold && aPacerSensitivity > aOversenseThreshold && vPacerSensitivity < vUndersenseThreshold && vPacerSensitivity > vOversenseThreshold && aPacerOutput > aCaptureThreshold && vPacerOutput > vCaptureThreshold) // sensitivity settings
    {
      
        settingsCorrect=true;
        document.getElementById("feedbackBox").innerText = "sensing/output: CORRECT"
      
      
    }
    else
      {
        settingsCorrect=false;
        document.getElementById("feedbackBox").innerText = "sensing/output: INCORRECT"
      }
  }
  else if (currentRhythm == 'aFib' || currentRhythm == 'aFlutter')
  {
    
    if (aPacerSensitivity < aUndersenseThreshold && aPacerSensitivity > aOversenseThreshold && vPacerSensitivity < vUndersenseThreshold && vPacerSensitivity > vOversenseThreshold && vPacerOutput > vCaptureThreshold) // sensitivity settings
    {
        settingsCorrect=true;
        document.getElementById("feedbackBox").innerText = "sensing/output: CORRECT" 
    }
    else
      {
        settingsCorrect=false;
        document.getElementById("feedbackBox").innerText = "sensing/output: INCORRECT"
      }
      if (pacerMode=='DDD')
        {
          document.getElementById("feedbackBox").innerText = document.getElementById("feedbackBox").innerText.concat("\nBe careful of A-tracking supraventricular arrhythmias while in DDD mode")
        }
  }
}


function tickTimers() // advance all timers every time dataClock is advanced
{
  ventRefractoryTimer += 2 
  atrialRefractoryTimer += 2 
}


function widenWave(inputWave,factor)
{
  if (factor==0) {return inputWave}

  let widenedArray = [];
  for (let i = 0; i < factor; i++)
  {
    widenedArray = []
    for (let j = 0; j < inputWave.length; j++) 
    {
      
      widenedArray.push(inputWave[j])
      if (j == inputWave.length)
      {}
      else
      {
      widenedArray.push((inputWave[j+1]+inputWave[j])/2)
      }
    }
    inputWave=widenedArray.slice()
  }

  return widenedArray;
}
