package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/anvari1313/splitwise.go"
	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

type Request struct {
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	PaidBy      string  `json:"paidBy"`
	Pin         string  `json:"pin"`
	SplitPct    float64 `json:"splitPct"`
	Currency    string  `json:"currency"`
}

func handler(request events.APIGatewayProxyRequest) (*events.APIGatewayProxyResponse, error) {
	if request.HTTPMethod != "POST" {
		return &events.APIGatewayProxyResponse{
			StatusCode: 400,
		}, nil
	}
	var req = Request{}
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       fmt.Sprintf("Error parsing input, %v", err.Error()),
		}, nil
	}
	if req.Pin != os.Getenv("AUTH_PIN") {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "invalid pin",
		}, nil
	}

	if req.Currency == "" {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "invalid currency",
		}, nil
	}

	var tanmayPaidShare float64 = 0.0
	var aayushiPaidShare float64 = 0.0
	if req.PaidBy == "Tanmay" {
		tanmayPaidShare = req.Amount
	} else {
		aayushiPaidShare = req.Amount
	}
	auth := splitwise.NewAPIKeyAuth(os.Getenv("SPLITWISE_API_KEY"))
	client := splitwise.NewClient(auth)
	splitPct := req.SplitPct / 100
	userShares := []splitwise.UserShare{
		{
			UserID:    1839952,
			PaidShare: fmt.Sprintf("%.2f", tanmayPaidShare),
			OwedShare: fmt.Sprintf("%.2f", req.Amount*splitPct),
		},
		{
			UserID:    6814258,
			PaidShare: fmt.Sprintf("%.2f", aayushiPaidShare),
			OwedShare: fmt.Sprintf("%.2f", req.Amount*(1-splitPct)),
		},
	}

	expenses, err := client.CreateExpenseByShare(
		context.Background(),
		splitwise.Expense{
			Cost:         fmt.Sprintf("%.2f", req.Amount),
			Description:  req.Description,
			CurrencyCode: req.Currency,
			GroupId:      0,
		},
		userShares,
	)

	fmt.Printf("%+v\n", expenses)
	if err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       fmt.Sprintf("Error split: %s", err.Error()),
		}, nil
	}
	return &events.APIGatewayProxyResponse{
		StatusCode: 200,
		Body:       "Success split",
	}, nil
}

func main() {
	lambda.Start(handler)
}
