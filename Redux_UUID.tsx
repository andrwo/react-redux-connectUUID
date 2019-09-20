import React from 'react';
import { connect,DispatchProp,InferableComponentEnhancer,MapStateToPropsParam,Connect,Matching } from 'react-redux';
import { Action,AnyAction,Dispatch } from 'redux';
import { v4 } from 'uuid';
import { bindActionCreators, compose } from 'redux';
import _ from 'lodash';
import { useDispatch } from 'ducks/store';

// Inspired by react-redux-uuid

const NAME_KEY   = '@@UUID/NAME_KEY';
const UUID_KEY   = '@@UUID/UUID_KEY';
const REGISTER   = '@@UUID/REGISTER';
const UNREGISTER = '@@UUID/UNREGISTER';

export interface IRedux_UUID_Meta {
  meta:{
    [UUID_KEY]: string,
    [NAME_KEY]: string
  }
}

export interface IRedux_UUID_DispatchProps<A extends Action = AnyAction> extends DispatchProp {
  dispatchUUID:Dispatch<A>;
}

export const createUUID = () => v4();
//export const getUUIDState = (state:any, name:string) => _.get(state, ['uuid', name]);

export const getUUIDState = (state:any, name:string, ...args:any[]):any => _.get(state, ['uuid', name, ...args]);
export const getRegisteredUUIDs = (state:any, name:string) => Object.keys(getUUIDState(state, name));

export const registerUUID = (name:string, uuid:string) => ({
  type: REGISTER,
  meta: {
    [UUID_KEY]: uuid,
    [NAME_KEY]: name
  }
});

export const unregisterUUID = (name:string, uuid:string) => ({
  type: UNREGISTER,
  meta: {
    [UUID_KEY]: uuid,
    [NAME_KEY]: name
  }
});


export const wrapActionCreators = (actionCreator:any, name:string, uuid:string):any => {
  if (name === undefined) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Wrapped action creators must have a name parameter');
    } else {
      throw new Error(`Looks like youre passing undefined as a name to the wrapActionCreators\
        function call
        Example:
          import { wrapActionCreators } from 'react-redux-uuid';
          const generalActions = { add, subtract };
          // this would apply the add and subtract actions to all reducers within the counter name
          const mapDispatchToProps = wrapActionCreators(generalActions, 'counter');
      `);
    }
  }

  if (_.isObjectLike(actionCreator)) {
    return _.mapValues(actionCreator, ac => wrapActionCreators(ac, name, uuid));
  }

  function wrapAction(action:any) {
      if (_.isObjectLike(action)) {
          return augmentAction(action, name, uuid);
      } else {
          // for redux-thunk
          return (dispatch:any) => action(augmentDispatch(dispatch));
      }
  }

  function augmentDispatch(dispatch:any) {
      return compose(dispatch,wrapAction);
  }

  return (...args:any[]) => wrapAction(actionCreator(...args));
};

const augmentAction = (action:any, name:string, uuid:string) => {
  return {
    ...action,
    meta: Object.assign(
        {},
        action.meta,
        name && {[NAME_KEY]: name},
        uuid && {[UUID_KEY]: uuid},
    )
  }};

export const wrapMapStateToProps = (mapStateToProps:any, name:string) => (state:any, props:any) => {
  if (_.isNil(mapStateToProps)) return {};

  const localState = getUUIDState(state, name, props.uuid);
  //if(innerState!==undefined)
    //innerState.globalState={...state};

  /*if (innerState === undefined) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Can\'t find the state by UUID');
    } else {
      throw new Error(`Looks like your uuid reducer setup is wrong. Make sure to have the\
        resulting reducer of the createUUIDReducer at the \`uuid\` key in your state's top level\
        reducers,
        Example:
          import { createUUIDReducer } from 'react-redux-uuid';
          const mainAppReducer = combineReducers({
            uuid: createUUIDReducer({
              counter: counterReducer,
              fizzbuzz: fizzbuzzReducer
            })
          })
          const store = createStore(mainAppReducer, ...);
      `);
    }
  }*/

  return mapStateToProps(
    {localState:localState,globalState:state,name:name,uuid:props.uuid},
    props
  );
};

export const wrapMapDispatchToProps = (mapDispatchToProps:any, name:string) => (dispatch:any, { uuid, ...props }:{uuid:string,[k:string]:any}) => {
  if (_.isNil(mapDispatchToProps)) return {};
  if (_.isObjectLike(mapDispatchToProps)) {
    const actions = wrapActionCreators(mapDispatchToProps, name, uuid);
    // memoize wrapped actions by passing a thunk
    return () => bindActionCreators(actions, dispatch);
  }
  return mapDispatchToProps(dispatch, props);
};


export interface IRedux_UUID_DispatchProps<A extends Action = AnyAction> extends DispatchProp {
  dispatchUUID:Dispatch<A>;
}
interface InterfaceProps {
  uuid?:string;
}
export const connectUUID = (name:string, mapStateToProps?:any) => <T extends Matching<{}, T>>(Component:React.ComponentType<T>) => {
  const ConnectedComponent = connect(
    (mapStateToProps?wrapMapStateToProps(mapStateToProps, name):null)
  )(Component);
  class ConnectUUID extends React.Component<InterfaceProps & DispatchProp> {
    uuid:string='';
    dispatchUUID = (action:any) => {
      const action2={
        ...action,
        meta: Object.assign(
            {},
            action.meta,
            name && {[NAME_KEY]: name},
            this.uuid && {[UUID_KEY]: this.uuid},
        )
      }
      this.props.dispatch(action2);
    }
    componentWillMount() {
      this.uuid = this.props.uuid || createUUID();

      if (!this.props.uuid) {
        this.props.dispatch({
          type: REGISTER,
          meta: {
            [UUID_KEY]: this.uuid,
            [NAME_KEY]: name
          }
        });
      }
    }
    componentWillUnmount() {
      if (!this.props.uuid) {
        this.props.dispatch({
          type: UNREGISTER,
          meta: {
            [UUID_KEY]: this.uuid,
            [NAME_KEY]: name
          }
      });
    }}
    render() {
      return (
        <ConnectedComponent
          {...this.props}
          dispatchUUID={this.dispatchUUID}
          uuid={this.uuid}
        />
      );
    }
  }
  return connect()(ConnectUUID);
};

export const createUUIDReducer = (reducers:any) => {
  const splitReducer = _.mapValues(reducers, (reducer) => (state:any = {}, action:any) => {
    if (!_.has(action, ['meta', UUID_KEY]))
      return _.mapValues(state, (innerState) => reducer(innerState, action));
    const key = action.meta[UUID_KEY];

    switch (action.type) {
      case REGISTER: return Object.assign(
        {},
        state,
        _.mapValues(
          typeof key === 'string' ? { [key]: undefined } : key,
          (initialState) => reducer(initialState, action)
        )
      );
      case UNREGISTER: return _.omit(state, key);
    }

    return _.has(state, key)
      ? { ...state, [key]: reducer(state[key], action) }
      : state;
  });

  return (state = {}, action:any) => {
    if (!_.has(action, ['meta', NAME_KEY]))
      return _.mapValues(splitReducer, (reducer:any, key:string) => reducer(state[key], action));

    const name = action.meta[NAME_KEY];

    return Object.assign({}, state, {
      [name]: splitReducer[name](state[name], action)
    });
  };
}


export default connectUUID;
