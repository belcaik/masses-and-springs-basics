// Copyright 2018-2025, University of Colorado Boulder

/**
 * View for Lab screen.
 *
 * @author Denzell Barnett (PhET Interactive Simulations)
 */

import DerivedProperty from '../../../../axon/js/DerivedProperty.js';
import Vector2 from '../../../../dot/js/Vector2.js';
import MassesAndSpringsConstants from '../../../../masses-and-springs/js/common/MassesAndSpringsConstants.js';
import MassesAndSpringsColors from '../../../../masses-and-springs/js/common/view/MassesAndSpringsColors.js';
import MassValueControlPanel from '../../../../masses-and-springs/js/common/view/MassValueControlPanel.js';
import OneSpringScreenView from '../../../../masses-and-springs/js/common/view/OneSpringScreenView.js';
import ReferenceLineNode from '../../../../masses-and-springs/js/common/view/ReferenceLineNode.js';
import ShelfNode from '../../../../masses-and-springs/js/common/view/ShelfNode.js';
import PeriodTraceNode from '../../../../masses-and-springs/js/lab/view/PeriodTraceNode.js';
import VectorVisibilityControlNode from '../../../../masses-and-springs/js/vectors/view/VectorVisibilityControlNode.js';
import VBox from '../../../../scenery/js/layout/nodes/VBox.js';
import Text from '../../../../scenery/js/nodes/Text.js';
import RectangularPushButton from '../../../../sun/js/buttons/RectangularPushButton.js';
import LineOptionsNode from '../../common/view/LineOptionsNode.js';
import massesAndSpringsBasics from '../../massesAndSpringsBasics.js';
import MassesAndSpringsBasicsStrings from '../../MassesAndSpringsBasicsStrings.js';
import GravityAccordionBox from './GravityAccordionBox.js';

const centerOfOscillationString = MassesAndSpringsBasicsStrings.centerOfOscillation;

class LabScreenView extends OneSpringScreenView {
  /**
   * @param {LabModel} model
   * @param {Tandem} tandem
   *
   */
  constructor( model, tandem ) {

    // Calls common spring view
    super( model, tandem );
    const vectorVisibilityControlNode = new VectorVisibilityControlNode(
      model,
      tandem.createTandem( 'vectorVisibilityControlNode' ),
      {
        maxWidth: MassesAndSpringsConstants.PANEL_MAX_WIDTH + 30,
        showForces: false
      } );

    // VBox that contains all of the panel's content
    const optionsVBox = new VBox( {
      spacing: 10,
      children: [
        new LineOptionsNode( model, tandem ),
        MassesAndSpringsConstants.LINE_SEPARATOR( 165 ),
        vectorVisibilityControlNode
      ]
    } );

    // Panel that will display all the toggleable options.
    const optionsPanel = this.createOptionsPanel( optionsVBox, this.rightPanelAlignGroup, tandem );

    const gravityAccordionBox = new GravityAccordionBox(
      model.gravityProperty,
      model.bodyProperty,
      this,
      this.rightPanelAlignGroup,
      tandem.createTandem( 'gravityAccordionBox' ), {
        expandedProperty: model.gravityAccordionBoxExpandedProperty
      } );

    // Contains all of the options for the reference lines, gravity, damping, and toolbox
    // Export period CSV button and panel
    // Internal recorder state
    this._simTimeSeconds = 0; // simulation time accumulator for timestamps
    this._periodData = []; // { t: number, period: number }[]
    this._lastPeakTimeByDir = { 1: null, '-1': null };
    this._recordingActive = false; // gated by Start/Stop Recording buttons
    this._ySamples = []; // { t: number, y: number }[] continuous samples while recording

    // Helper to check if we should record data (match PeriodTrace visibility/conditions)
    const canRecordPeriod = () => {
      const spring = model.firstSpring;
      const mass = spring.massAttachedProperty.value;
      return !!( this._recordingActive &&
                 mass && !mass.userControlledProperty.value &&
                 spring.periodTraceVisibilityProperty.value &&
                 mass.verticalVelocityProperty.value !== 0 );
    };

    // Listen for peaks (1 for upward, -1 for downward) and compute full period between same-direction peaks
    model.firstSpring.peakEmitter.addListener( direction => {
      if ( canRecordPeriod() ) {
        const t = this._simTimeSeconds;
        const key = String( direction );
        const last = this._lastPeakTimeByDir[ key ];
        if ( typeof last === 'number' ) {
          const period = t - last;
          if ( period > 0 ) {
            const yRel = model.firstSpring.massEquilibriumDisplacementProperty.value;
            this._periodData.push( { t, period, y: typeof yRel === 'number' ? yRel : 0 } );
          }
        }
        this._lastPeakTimeByDir[ key ] = t;
      }
    } );

    // Clear last-peak memory when the period trace is turned off
    model.firstSpring.periodTraceVisibilityProperty.lazyLink( visible => {
      if ( !visible ) {
        this._lastPeakTimeByDir = { 1: null, '-1': null };
      }
    } );

    // Export and Recording buttons
    const startButton = new RectangularPushButton( {
      content: new Text( 'Start Recording' ),
      listener: () => {
        this._periodData = [];
        this._ySamples = [];
        this._lastPeakTimeByDir = { 1: null, '-1': null };
        this._simTimeSeconds = 0;
        this._recordingActive = true;
      }
    } );

    const stopButton = new RectangularPushButton( {
      content: new Text( 'Stop Recording' ),
      listener: () => {
        this._recordingActive = false;
      }
    } );

    // Export button
    const exportButton = new RectangularPushButton( {
      content: new Text( 'Export Period CSV' ),
      listener: () => {
        if ( this._periodData.length === 0 ) {
          // Nothing to export; silently no-op
          return;
        }
        // Build unified CSV with both samples and period points
        // time_s starts at 0 on recording start; y is measured relative to center of oscillation
        const header = 'kind,time_s,period_s,y_rel_center_m\n';

        // Merge and sort by time for readability
        const combined = [
          ...this._ySamples.map( s => ( { kind: 'sample', t: s.t, period: '', y: s.y } ) ),
          ...this._periodData.map( d => ( { kind: 'period', t: d.t, period: d.period, y: d.y } ) )
        ].sort( ( a, b ) => a.t - b.t );

        const rows = combined.map( r => `${r.kind},${r.t.toFixed( 3 )},${r.period === '' ? '' : r.period.toFixed( 3 )},${r.y.toFixed( 4 )}` ).join( '\n' );
        const csv = header + rows + '\n';

        try {
          const blob = new Blob( [ csv ], { type: 'text/csv;charset=utf-8;' } );
          const url = URL.createObjectURL( blob );
          const a = document.createElement( 'a' );
          a.href = url;
          a.download = 'period_vs_time.csv';
          document.body.appendChild( a );
          a.click();
          document.body.removeChild( a );
          setTimeout( () => URL.revokeObjectURL( url ), 1000 );
        }
        catch( e ) {
          // Fallback: open data in a new tab
          const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent( csv );
          window.open( dataUrl );
        }
      }
    } );

    const exportPanel = this.createOptionsPanel( new VBox( { children: [ startButton, stopButton, exportButton ], spacing: 8 } ), this.rightPanelAlignGroup, tandem );

    const rightPanelsVBox = new VBox( {
      children: [ optionsPanel, gravityAccordionBox, this.toolboxPanel, exportPanel ],
      spacing: this.spacing * 0.9
    } );

    // Shelf used for masses
    const shelf = new ShelfNode( tandem, {
      rectHeight: 7,
      rectWidth: 200,
      left: this.visibleBoundsProperty.value.left + this.spacing,
      rectY: this.modelViewTransform.modelToViewY( MassesAndSpringsConstants.FLOOR_Y ) - this.shelf.rectHeight
    } );

    // Initializes equilibrium line for an attached mass
    const equilibriumLineNode = new ReferenceLineNode(
      this.modelViewTransform,
      model.firstSpring,
      model.firstSpring.equilibriumYPositionProperty,
      this.equilibriumVisibilityProperty, {
        stroke: MassesAndSpringsColors.restingPositionProperty
      }
    );
    this.addChild( equilibriumLineNode );

    const oscillationVisibilityProperty = new DerivedProperty( [
        model.firstSpring.periodTraceVisibilityProperty,
        model.accelerationVectorVisibilityProperty,
        model.velocityVectorVisibilityProperty,
        model.firstSpring.massAttachedProperty
      ],
      ( periodTraceVisible, accelerationVectorVisible, velocityVectorVisible, massAttached ) => {
        if ( massAttached ) {
          return periodTraceVisible || accelerationVectorVisible || velocityVectorVisible;
        }
        else {
          return false;
        }
      } );

    // Initializes center of oscillation line for an attached mass
    const centerOfOscillationLineNode = new ReferenceLineNode(
      this.modelViewTransform,
      model.firstSpring,
      model.firstSpring.equilibriumYPositionProperty,
      oscillationVisibilityProperty, {
        stroke: 'black',
        label: new Text( centerOfOscillationString, {
          font: MassesAndSpringsConstants.TITLE_FONT,
          fill: 'black',
          maxWidth: 125
        } )
      }
    );
    this.addChild( centerOfOscillationLineNode );

    // Accessed in Basics version to adjust to a larger width.
    const massValueControlPanel = new MassValueControlPanel(
      model.masses[ 0 ],
      this.massNodeIcon,
      tandem.createTandem( 'massValueControlPanel' ), {
        maxWidth: MassesAndSpringsConstants.PANEL_MAX_WIDTH + MassesAndSpringsConstants.PANEL_MAX_WIDTH * 0.05,
        basicsVersion: model.basicsVersion
      }
    );

    this.springSystemControlsNode.setChildren( [
      massValueControlPanel, this.springHangerNode, this.springStopperButtonNode
    ] );
    this.springSystemControlsNode.spacing = this.spacing * 1.2;

    // @private {PeriodTraceNode}
    this.periodTraceNode = new PeriodTraceNode( model.firstSpring.periodTrace, this.modelViewTransform, model.basicsVersion, {
      center: this.massEquilibriumLineNode.center
    } );

    // Move layers with interactive elements and layers to the front
    this.movableLineNode.moveToFront();
    this.massLayer.moveToFront();
    this.toolsLayer.moveToFront();

    this.resetAllButton.addListener( () => {
      this.movableLineNode.reset();
      // Clear recorded period data and clock on reset-all
      this._periodData = [];
      this._ySamples = [];
      this._lastPeakTimeByDir = { 1: null, '-1': null };
      this._simTimeSeconds = 0;
    } );

    // Back layer used to handle z order of view elements.
    this.backLayer.children = [ this.backgroundDragPlane, rightPanelsVBox, shelf, this.periodTraceNode ];

    this.visibleBoundsProperty.link( () => {
      rightPanelsVBox.rightTop = new Vector2( this.panelRightSpacing, this.spacing );
      this.springSystemControlsNode.centerX = this.springCenter * 0.835; // centering springHangerNode over spring
      this.springConstantControlPanel.left = this.springSystemControlsNode.right + this.spacing;
    } );
  }

  /**
   * @public
   *
   * @param {number} dt
   */
  step( dt ) {
    // Record samples at the current time, then advance clock.
    // This ensures the first recorded timestamp is exactly 0.00 s.
    if ( this.model.playingProperty.value ) {
      // Record intermediate y samples while recording and conditions hold
      const spring = this.model.firstSpring;
      const mass = spring.massAttachedProperty.value;
      if ( this._recordingActive && mass && !mass.userControlledProperty.value && spring.periodTraceVisibilityProperty.value ) {
        const yRel = spring.massEquilibriumDisplacementProperty.value;
        const y = ( typeof yRel === 'number' ) ? yRel : 0;
        this._ySamples.push( { t: this._simTimeSeconds, y } );
      }

      // Advance local simulation clock for timestamping after sampling
      this._simTimeSeconds += dt;
    }
    this.periodTraceNode.step( dt, this.model.playingProperty );
  }
}

massesAndSpringsBasics.register( 'LabScreenView', LabScreenView );
export default LabScreenView;
