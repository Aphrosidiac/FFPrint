// FF Print's baseline for the Ender-3 V3 SE: the values Creality Print 7.3 ships in its own
// "0.20mm Standard @Creality Ender-3 V3 SE 0.4 nozzle" preset where they differ from OrcaSlicer's V3 SE
// preset. These are what Fakhrul's prints have used so far. Applied on top of Orca's system preset
// and under every user choice (strength/supports/adhesion/overrides).
// Source: diff of the two resolved presets, 2026-10-14.

export const CREALITY_TUNING: Record<string, string> = {
  elefant_foot_compensation: '0.15',
  enable_arc_fitting: '1',
  bridge_speed: '50',
  line_width: '0.45',
  initial_layer_line_width: '0.5',
  support_line_width: '0.4',
  overhang_2_4_speed: '60',
  overhang_3_4_speed: '30',
  top_surface_pattern: 'monotonic',
  support_top_z_distance: '0.2',
  support_bottom_z_distance: '0.2',
  support_object_xy_distance: '0.35',
  support_interface_bottom_layers: '2',
  tree_support_branch_angle: '45',
  only_one_wall_top: '1',
  skirt_speed: '50',
  enable_prime_tower: '0',
  gcode_label_objects: '1'
}
