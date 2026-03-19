# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from . import __version__ as app_version

app_name = "overtime"
app_title = "Overtime"
app_publisher = "info@progressiveit.in"
app_description = "overtime calculation"
app_icon = "fa fa-money"
app_color = "black"
app_email = "info@progressiveit.in"
app_license = "MIT"


fixtures = ["Custom Field"]
# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/overtime/css/overtime.css"
# app_include_js = "/assets/overtime/js/overtime.js"

# include js, css files in header of web template
# web_include_css = "/assets/overtime/css/overtime.css"
# web_include_js = "/assets/overtime/js/overtime.js"

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {"Attendance" : "public/js/attendance.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
#	"Role": "home_page"
# }

# Website user home page (by function)
# get_website_user_home_page = "overtime.utils.get_home_page"

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Installation
# ------------

# before_install = "overtime.install.before_install"
# after_install = "overtime.install.after_install"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "overtime.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"Attendance": {
		"validate": ["overtime.overtime.attendance_custom.calculate_ot_hrs",
		"overtime.overtime.attendance_custom.calculate_ot_amount"]
	},
	"Project" : {
		"validate" : ["overtime.overtime.project_custom.update_amount","overtime.overtime.project_custom.update_stock_amount",
                "overtime.overtime.project_custom.update_journal_amount" ]
		
		
	}

	

}




# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"overtime.tasks.all"
# 	],
# 	"daily": [
# 		"overtime.tasks.daily"
# 	],
# 	"hourly": [
# 		"overtime.tasks.hourly"
# 	],
# 	"weekly": [
# 		"overtime.tasks.weekly"
# 	]
# 	"monthly": [
# 		"overtime.tasks.monthly"
# 	]
# }

# Testing
# -------

# before_tests = "overtime.install.before_tests"

# Overriding Whitelisted Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "overtime.event.get_events"
# }

