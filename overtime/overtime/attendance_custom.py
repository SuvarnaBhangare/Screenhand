import frappe

def calculate_ot_hrs(doc,method):
  ot_hours = 0.0;
  ot_hours = (doc.overtime_in_minutes/60.00);
  doc.overtime_in_hours=ot_hours
  frappe.msgprint("sucess")
    
    
def calculate_ot_amount(doc,method):
  ot_amount = 0.0;
  ot_rate=frappe.utils.data.flt(doc.ot_rate,precision=None)
  ot_amount = (doc.overtime_in_hours * ot_rate);
  doc.ot_amount=ot_amount
    
  