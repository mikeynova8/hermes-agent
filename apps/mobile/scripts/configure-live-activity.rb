#!/usr/bin/env ruby
# frozen_string_literal: true

require 'xcodeproj'

project_path = File.expand_path('../ios/App/App.xcodeproj', __dir__)
project = Xcodeproj::Project.open(project_path)
app_target = project.targets.find { |target| target.name == 'App' }
abort 'App target not found' unless app_target
if project.targets.any? { |target| target.name == 'MikeyWidgets' }
  puts 'MikeyWidgets target already configured'
  exit 0
end

root = project.main_group
app_group = root.find_subpath('App', false)
shared_group = root.new_group('Shared', 'Shared')
widgets_group = root.new_group('MikeyWidgets', 'MikeyWidgets')

plugin_ref = app_group.new_file('MikeyActivityPlugin.swift')
bridge_ref = app_group.new_file('MikeyBridgeViewController.swift')
shared_ref = shared_group.new_file('MikeyActivityAttributes.swift')
widget_ref = widgets_group.new_file('MikeyWidgets.swift')
widgets_group.new_file('Info.plist')

app_target.add_file_references([plugin_ref, bridge_ref, shared_ref])

widget_target = project.new_target(:app_extension, 'MikeyWidgets', :ios, '16.2')
widget_target.add_file_references([widget_ref, shared_ref])

widget_target.build_configurations.each do |configuration|
  settings = configuration.build_settings
  settings['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  settings['CODE_SIGN_STYLE'] = 'Automatic'
  settings['CURRENT_PROJECT_VERSION'] = '9'
  settings['DEVELOPMENT_TEAM'] = 'JXF76W23J6'
  settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  settings['INFOPLIST_FILE'] = 'MikeyWidgets/Info.plist'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.2'
  settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
  settings['MARKETING_VERSION'] = '1.0'
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.ignacioiacovino.mikey.widgets'
  settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  settings['SKIP_INSTALL'] = 'YES'
  settings['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
  settings['SWIFT_VERSION'] = '5.0'
  settings['TARGETED_DEVICE_FAMILY'] = '1,2'
end

app_target.add_dependency(widget_target)
embed_phase = app_target.new_copy_files_build_phase('Embed App Extensions')
embed_phase.dst_subfolder_spec = '13'
build_file = embed_phase.add_file_reference(widget_target.product_reference, true)
build_file.settings = { 'ATTRIBUTES' => %w[CodeSignOnCopy RemoveHeadersOnCopy] }

project.save
puts "Configured #{widget_target.name} and embedded #{widget_target.product_reference.path}"
