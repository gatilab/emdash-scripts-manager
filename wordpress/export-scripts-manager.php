<?php
/**
 * Read-only export of the Marketers Delight Scripts Manager drop-in's data,
 * for the EmDash plugin's importer. Run with WP-CLI:
 *
 *   wp eval-file export-scripts-manager.php > scripts.json
 *
 * Exported (nothing is written to the database):
 *
 *   global        option `marketers_delight` → settings.header_scripts / footer_scripts
 *   posts         post meta `marketers_delight` → scripts.header_scripts / footer_scripts /
 *                 body_class / scripts_manager, with each post's type, slug, status and path
 *   terms         term meta `marketers_delight` → scripts.header_scripts / footer_scripts
 *   registry      option `md_scripts_manager` (Scripts Manager 3 records and settings)
 *   integrations  names of enabled built-in integrations (no keys)
 *
 * Header and footer code is exported the way the drop-in printed it, through
 * html_entity_decode(). Registry code is exported as stored: the drop-in
 * printed it unchanged. The file holds executable code; keep it private.
 */

global $wpdb;

if ( ! function_exists( 'md_scripts_export_fields' ) ) {
	/**
	 * The legacy header/footer/body-class fields of one `scripts` array.
	 */
	function md_scripts_export_fields( $scripts ): array {
		$scripts = is_array( $scripts ) ? $scripts : array();
		$out = array(
			'header_scripts' => isset( $scripts['header_scripts'] ) ? html_entity_decode( (string) $scripts['header_scripts'] ) : '',
			'footer_scripts' => isset( $scripts['footer_scripts'] ) ? html_entity_decode( (string) $scripts['footer_scripts'] ) : '',
			'body_class'     => isset( $scripts['body_class'] ) ? (string) $scripts['body_class'] : '',
		);

		// Dequeue choices: an associative map (checkbox storage) or a list.
		$dequeues = array();
		foreach ( (array) ( $scripts['scripts_manager'] ?? array() ) as $key => $value ) {
			if ( is_string( $key ) && $value ) $dequeues[] = $key;
			elseif ( is_int( $key ) && is_string( $value ) ) $dequeues[] = $value;
		}
		$out['scripts_manager'] = $dequeues;
		return $out;
	}
}

$has_code = static function ( array $fields ): bool {
	return trim( $fields['header_scripts'] ) !== '' || trim( $fields['footer_scripts'] ) !== '' || trim( $fields['body_class'] ) !== '' || ! empty( $fields['scripts_manager'] );
};

// Global legacy fields.
$option = get_option( 'marketers_delight', array() );
$option = is_array( $option ) ? $option : array();
$settings = isset( $option['settings'] ) && is_array( $option['settings'] ) ? $option['settings'] : array();
$global = array(
	'header_scripts' => ! empty( $settings['header_scripts'] ) ? html_entity_decode( (string) $settings['header_scripts'] ) : '',
	'footer_scripts' => ! empty( $settings['footer_scripts'] ) ? html_entity_decode( (string) $settings['footer_scripts'] ) : '',
);

// Per-post fields. The meta is one serialized array per post.
$posts = array();
$rows = $wpdb->get_results(
	$wpdb->prepare( "SELECT post_id, meta_value FROM {$wpdb->postmeta} WHERE meta_key = %s ORDER BY post_id ASC", 'marketers_delight' ),
	ARRAY_A
);
foreach ( $rows as $row ) {
	$meta = maybe_unserialize( $row['meta_value'] );
	if ( ! is_array( $meta ) || empty( $meta['scripts'] ) ) continue;
	$fields = md_scripts_export_fields( $meta['scripts'] );
	if ( ! $has_code( $fields ) ) continue;

	$post = get_post( (int) $row['post_id'] );
	if ( ! $post || $post->post_type === 'revision' ) continue;
	$link = get_permalink( $post );
	$posts[] = array(
		'id'        => (int) $post->ID,
		'post_type' => $post->post_type,
		'slug'      => $post->post_name,
		'status'    => $post->post_status,
		'title'     => get_the_title( $post ),
		'path'      => $link ? (string) wp_parse_url( $link, PHP_URL_PATH ) : '',
		'scripts'   => $fields,
	);
}

// Per-term fields (reported by the importer, not imported).
$terms = array();
$rows = $wpdb->get_results(
	$wpdb->prepare( "SELECT term_id, meta_value FROM {$wpdb->termmeta} WHERE meta_key = %s ORDER BY term_id ASC", 'marketers_delight' ),
	ARRAY_A
);
foreach ( $rows as $row ) {
	$meta = maybe_unserialize( $row['meta_value'] );
	if ( ! is_array( $meta ) || empty( $meta['scripts'] ) ) continue;
	$fields = md_scripts_export_fields( $meta['scripts'] );
	if ( ! $has_code( $fields ) ) continue;

	$term = get_term( (int) $row['term_id'] );
	if ( ! $term || is_wp_error( $term ) ) continue;
	$link = get_term_link( $term );
	$terms[] = array(
		'id'       => (int) $term->term_id,
		'taxonomy' => $term->taxonomy,
		'slug'     => $term->slug,
		'path'     => is_wp_error( $link ) ? '' : (string) wp_parse_url( $link, PHP_URL_PATH ),
		'scripts'  => $fields,
	);
}

// Scripts Manager 3 registry, as stored.
$registry = get_option( 'md_scripts_manager', array() );
$registry = is_array( $registry ) ? $registry : array();

// Enabled built-in integrations, by name only.
$integrations = array();
$enabled = isset( $option['integrations']['enabled'] ) && is_array( $option['integrations']['enabled'] ) ? $option['integrations']['enabled'] : array();
$keys = isset( $option['integrations']['api_keys'] ) && is_array( $option['integrations']['api_keys'] ) ? $option['integrations']['api_keys'] : array();
foreach ( $enabled as $name => $on ) {
	if ( $on && ! empty( $keys[ $name ] ) ) $integrations[] = (string) $name;
}

echo wp_json_encode(
	array(
		'format'       => 'md-scripts-manager-export',
		'version'      => 1,
		'site'         => home_url( '/' ),
		'exported_at'  => gmdate( 'c' ),
		'global'       => $global,
		'posts'        => $posts,
		'terms'        => $terms,
		'registry'     => array(
			'items'    => isset( $registry['items'] ) && is_array( $registry['items'] ) ? $registry['items'] : array(),
			'settings' => isset( $registry['settings'] ) && is_array( $registry['settings'] ) ? $registry['settings'] : array(),
		),
		'integrations' => $integrations,
	),
	JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
);
