import frappe


  
  
def update_journal_amount(doc,method):
		total_journal_entry_amount = frappe.db.sql("""select sum(debit_in_account_currency)
			from `tabJournal Entry Account` where project = %s and docstatus=1""", doc.name)
		
		doc.total_journal_entry_amount = total_journal_entry_amount and total_journal_entry_amount[0][0] or 0
		
    
  
    
def update_stock_amount(doc,method):
		stock_entry_consumable = frappe.db.sql("""select sum(total_outgoing_value)
			from `tabStock Entry` where project = %s and purpose="Material Issue" and docstatus=1""", doc.name)

		doc.stock_entry_consumable = stock_entry_consumable and stock_entry_consumable[0][0] or 0
    
    
def update_amount(doc,method):
		stock_entry_transfer = frappe.db.sql("""select sum(total_outgoing_value)
			from `tabStock Entry` where project = %s and purpose="Material Transfer for Manufacture" and docstatus=1""", doc.name)

		doc.stock_entry_transfer = stock_entry_transfer and stock_entry_transfer[0][0] or 0
		
    
    