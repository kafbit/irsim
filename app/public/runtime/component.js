// @ts-check
/**
 * The base every board script extends, and the one place a board's `class Component` is turned
 * into a constructor. The boards use exactly three members of it (`props`, `state`, `setState`);
 * everything else they touch is their own field.
 */

/**
 * @typedef {DCLogic & {
 *   renderVals?: () => Record<string, unknown>,
 *   componentDidUpdate?: () => void,
 *   componentWillUnmount?: () => void,
 * }} ComponentInstance
 */
/** @typedef {new (props: Record<string, unknown>) => ComponentInstance} ComponentClass */

export class DCLogic {
  /** @param {Record<string, unknown>} props */
  constructor(props) {
    this.props = props
    /** @type {Record<string, unknown>} */
    this.state = {}
    /** @type {(() => void) | undefined} */
    this.__update = undefined
  }

  /**
   * Merge into `state` and re-render this component. The boards call it several times in a row,
   * so the update is queued rather than nested.
   *
   * @param {Record<string, unknown>} next
   */
  setState(next) {
    this.state = { ...this.state, ...next }
    this.__update?.()
  }
}

/**
 * Evaluate a board's `text/x-dc` script and hand back its Component class.
 *
 * @param {string} source
 * @param {Record<string, unknown>} [shared] the modules of `design/shared/`, by camelCased path
 * @returns {ComponentClass}
 */
export const instantiate = (source, shared = {}) => {
  if (source.trim() === '') return class extends DCLogic {}
  // eslint-disable-next-line no-new-func -- the board's own code, and only in this local tool
  const factory = new Function('DCLogic', 'shared', `${source}\nreturn Component;`)
  const Component = factory(DCLogic, shared)
  if (typeof Component !== 'function') throw new Error('board script does not declare Component')
  return Component
}
