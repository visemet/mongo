/*-
 * Copyright (c) 2008-2012 WiredTiger, Inc.
 *	All rights reserved.
 *
 * See the file LICENSE for redistribution information.
 */

#include "format.h"

void
wts_load(void)
{
	WT_CONNECTION *conn;
	WT_CURSOR *cursor;
	WT_SESSION *session;
	static WT_ITEM key, value;
	uint8_t *keybuf;
	int ret;

	conn = g.wts_conn;

	if ((ret = conn->open_session(conn, NULL, NULL, &session)) != 0)
		die("connection.open_session", ret);

	/*
	 * Avoid bulk load with a custom collator, because the order of
	 * insertion will not match the collation order.
	 */
	if ((ret = session->open_cursor(session, WT_TABLENAME, NULL,
	    (g.c_file_type == ROW && g.c_reverse) ? NULL : "bulk",
	    &cursor)) != 0)
		die("session.open_cursor", ret);

	/* Set up the default key buffer. */
	memset(&key, 0, sizeof(key));   
	key_gen_setup(&keybuf);

	for (;;) {
		if (++g.key_cnt > g.c_rows) {
			g.key_cnt = g.rows = g.c_rows;
			break;
		}

		/* Report on progress every 100 inserts. */
		if (g.key_cnt % 100 == 0)
			track("bulk load", g.key_cnt);

		key.data = keybuf;
		key_gen(keybuf, &key.size, (uint64_t)g.key_cnt, 0);
		value_gen(&value.data, &value.size, (uint64_t)g.key_cnt);

		switch (g.c_file_type) {
		case FIX:
			if (g.logging == LOG_OPS)
				(void)session->msg_printf(session,
				    "%-10s %" PRIu32 " {0x%02" PRIx8 "}",
				    "bulk V",
				    g.key_cnt, ((uint8_t *)value.data)[0]);
			cursor->set_value(cursor, *(uint8_t *)value.data);
			break;
		case VAR:
			cursor->set_value(cursor, &value);
			if (g.logging == LOG_OPS)
				(void)session->msg_printf(session,
				    "%-10s %" PRIu32 " {%.*s}", "bulk V",
				    g.key_cnt,
				    (int)value.size, (char *)value.data);
			break;
		case ROW:
			cursor->set_key(cursor, &key);
			if (g.logging == LOG_OPS)
				(void)session->msg_printf(session,
				    "%-10s %" PRIu32 " {%.*s}", "bulk K",
				    g.key_cnt, (int)key.size, (char *)key.data);
			cursor->set_value(cursor, &value);
			if (g.logging == LOG_OPS)
				(void)session->msg_printf(session,
				    "%-10s %" PRIu32 " {%.*s}", "bulk V",
				    g.key_cnt,
				    (int)value.size, (char *)value.data);
			break;
		}

		if ((ret = cursor->insert(cursor)) != 0)
			die("cursor.insert", ret);

		if (!SINGLETHREADED)
			continue;

		/* Insert the item into BDB. */
		bdb_insert(key.data, key.size, value.data, value.size);
	}

	if ((ret = cursor->close(cursor)) != 0)
		die("cursor.close", ret);

	if ((ret = session->close(session, NULL)) != 0)
		die("session.close", ret);
}
