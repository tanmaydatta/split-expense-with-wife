package main

import (
	"bytes"
	"io"
	"net/http"

	"github.com/syumai/workers"
	"github.com/tanmaydatta/split-expense-with-wife/splitexpense/handlers"
)

func main() {
	http.HandleFunc("/hello", func(w http.ResponseWriter, req *http.Request) {
		msg := "Hello!"
		w.Write([]byte(msg))
	})
	http.HandleFunc("/echo", func(w http.ResponseWriter, req *http.Request) {
		b, err := io.ReadAll(req.Body)
		if err != nil {
			panic(err)
		}
		io.Copy(w, bytes.NewReader(b))
	})

	http.HandleFunc("/.netlify/functions/balances", handlers.BalancesHandler)
	http.HandleFunc("/.netlify/functions/budget", handlers.BudgetHandler)
	http.HandleFunc("/.netlify/functions/budget_delete", handlers.BudgetDeleteHandler)
	http.HandleFunc("/.netlify/functions/budget_list", handlers.BudgetListHandler)
	http.HandleFunc("/.netlify/functions/budget_monthly", handlers.BudgetMonthlyHandler)
	http.HandleFunc("/.netlify/functions/budget_total", handlers.BudgetTotalHandler)
	http.HandleFunc("/.netlify/functions/login", handlers.LoginHandler)
	http.HandleFunc("/.netlify/functions/logout", handlers.LogoutHandler)
	http.HandleFunc("/.netlify/functions/split", handlers.SplitHandler)
	http.HandleFunc("/.netlify/functions/split_delete", handlers.SplitDeleteHandler)
	http.HandleFunc("/.netlify/functions/split_new", handlers.SplitNewHandler)
	http.HandleFunc("/.netlify/functions/transactions_list", handlers.TransactionsListHandler)
	// Add other handlers here

	workers.Serve(nil) // use http.DefaultServeMux
}
