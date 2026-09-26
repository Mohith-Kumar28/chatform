-- An admin acting as a customer gets a real session for that customer, marked
-- with who is behind it. The mark is what keeps it out of the customer's
-- "last seen", out of active-organization resolution for their own devices,
-- and what the API reads to attribute every action to the admin.
ALTER TABLE `sessions` ADD `impersonated_by` text;
