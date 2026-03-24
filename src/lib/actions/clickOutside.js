/**
 * Svelte action to detect clicks outside an element
 * @param {HTMLElement} node
 * @param {() => void} callback
 */
export function clickOutside(node, callback) {
	/**
	 * @param {MouseEvent} event
	 */
	function handleClick(event) {
		if (node && !node.contains(event.target) && !event.defaultPrevented) {
			callback();
		}
	}

	document.addEventListener('click', handleClick, true);

	return {
		destroy() {
			document.removeEventListener('click', handleClick, true);
		}
	};
}
